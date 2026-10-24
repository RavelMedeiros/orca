import { runProcess } from '@orca/process-host'
import { join } from 'node:path'

// TEMP diagnostics for STA-11968.
export async function captureWindowsProcessSnapshot(rootPid: number | undefined): Promise<string> {
  if (process.platform !== 'win32') {
    return ''
  }
  const script = [
    'Get-CimInstance Win32_Process | ForEach-Object {',
    '  $created = if ($_.CreationDate) { $_.CreationDate.ToString("HH:mm:ss.fff") } else { "" }',
    '  "$($_.ProcessId)|$($_.ParentProcessId)|$($_.Name)|$created|$($_.CommandLine)"',
    '}',
    '$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average',
    '"CPU|$cpu"',
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 15 | ForEach-Object { "TOP|$($_.Id)|$($_.ProcessName)|$([math]::Round($_.CPU,1))|$([math]::Round($_.WorkingSet64/1MB))MB" }'
  ].join('\n')
  const startedAt = Date.now()
  const result = await runProcess({
    program: join(
      process.env.SystemRoot ?? 'C:\\Windows',
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe'
    ),
    args: ['-NoProfile', '-NonInteractive', '-Command', script],
    timeoutMs: 15_000,
    maxOutputBytes: 4_000_000
  })
  const lines = result.stdout.split(/\r?\n/).filter(Boolean)
  const loadLines = lines.filter((line) => line.startsWith('CPU|') || line.startsWith('TOP|'))
  const rows = lines
    .filter((line) => !line.startsWith('CPU|') && !line.startsWith('TOP|'))
    .map((line) => {
      const [pid, ppid, name, created, ...rest] = line.split('|')
      return {
        pid: Number(pid),
        ppid: Number(ppid),
        name: name ?? '',
        created,
        cmd: rest.join('|')
      }
    })
  const descendants = new Set<number>(rootPid ? [rootPid] : [])
  let grew = true
  while (grew) {
    grew = false
    for (const row of rows) {
      if (descendants.has(row.ppid) && !descendants.has(row.pid)) {
        descendants.add(row.pid)
        grew = true
      }
    }
  }
  const interesting = rows.filter(
    (row) =>
      descendants.has(row.pid) ||
      /^(cmd|bash|sh|more|powershell|pwsh|conhost|ssh-agent|curl|MsMpEng|git|orca-agent-hook)\.(exe|com)$/i.test(
        row.name
      )
  )
  return [
    `[DIAG] snapshot root=${rootPid} descendants=${[...descendants].join(',')} total=${rows.length} code=${result.code} took=${Date.now() - startedAt}ms stderr=${result.stderr.slice(0, 300)}`,
    ...loadLines,
    ...interesting.map(
      (row) =>
        `${descendants.has(row.pid) ? '*' : ' '} ${row.pid} <${row.ppid}> ${row.name} ${row.created} ${row.cmd.slice(0, 220)}`
    )
  ].join('\n')
}
