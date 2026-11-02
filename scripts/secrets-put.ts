import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

type ParsedVariable = {
  value: string
}

const usage = [
  'Usage:',
  '  bun run cf:secrets -- <env-file>',
  '',
  'Example:',
  '  bun run cf:secrets -- .env.production'
].join('\n')

function isEscaped(value: string, index: number) {
  let backslashes = 0

  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    backslashes += 1
  }

  return backslashes % 2 === 1
}

function parseQuotedValue(lines: string[], lineIndex: number, rawValue: string, quote: string) {
  const segments: string[] = []
  let currentLine = lineIndex
  let segment = rawValue.slice(1)

  while (true) {
    let closingIndex = -1

    for (let index = 0; index < segment.length; index += 1) {
      if (segment[index] === quote && !isEscaped(segment, index)) {
        closingIndex = index
        break
      }
    }

    if (closingIndex >= 0) {
      const trailing = segment.slice(closingIndex + 1).trimStart()

      if (trailing.length > 0 && !trailing.startsWith('#')) {
        throw new Error(`Unexpected text after quoted value on line ${lineIndex + 1}.`)
      }

      segments.push(segment.slice(0, closingIndex))
      let value = segments.join('\n')

      if (quote === '"') {
        value = value.replace(/\\n/g, '\n').replace(/\\r/g, '\r')
      }

      return { value, lastLineIndex: currentLine }
    }

    segments.push(segment)
    currentLine += 1

    if (currentLine >= lines.length) {
      throw new Error(`Unterminated quoted value starting on line ${lineIndex + 1}.`)
    }

    segment = lines[currentLine]
  }
}

function parseEnv(contents: string) {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)
  const variables = new Map<string, ParsedVariable>()
  let duplicateCount = 0

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]

    if (line.trim().length === 0 || line.trimStart().startsWith('#')) {
      continue
    }

    const assignment = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)

    if (!assignment) {
      throw new Error(`Could not parse .env assignment on line ${lineIndex + 1}.`)
    }

    const [, key, rawValue] = assignment
    let value: string
    const firstCharacter = rawValue[0]

    if (firstCharacter === '"' || firstCharacter === "'" || firstCharacter === '`') {
      const parsed = parseQuotedValue(lines, lineIndex, rawValue, firstCharacter)
      value = parsed.value
      lineIndex = parsed.lastLineIndex
    } else {
      value = rawValue.replace(/#.*$/, '').trim()
    }

    if (variables.has(key)) {
      duplicateCount += 1
    }

    // dotenv files conventionally use the last assignment when a key repeats.
    variables.set(key, { value })
  }

  return { variables, duplicateCount }
}

async function confirmUpload(secretCount: number) {
  const rl = createInterface({ input: stdin, output: stdout })

  try {
    const answer = await rl.question(
      `\nUpload ${secretCount} secret(s) with wrangler secret put? Each put creates and deploys a Worker version immediately. Type "yes" to continue: `
    )

    return answer.trim().toLowerCase() === 'yes'
  } finally {
    rl.close()
  }
}

async function putSecret(key: string, value: string) {
  const child = Bun.spawn(['wrangler', 'secret', 'put', key], {
    stdin: 'pipe',
    stdout: 'inherit',
    stderr: 'inherit'
  })

  child.stdin.write(value)
  child.stdin.end()

  const exitCode = await child.exited

  if (exitCode !== 0) {
    throw new Error(`wrangler secret put failed for ${key} (exit code ${exitCode}).`)
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === '--') {
    args.shift()
  }

  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage)
    return
  }

  if (args.length !== 1) {
    throw new Error(usage)
  }

  const envPath = args[0]
  const source = await Bun.file(envPath).text()
  const { variables, duplicateCount } = parseEnv(source)

  if (variables.size === 0) {
    console.log(`No variables detected in ${envPath}.`)
    return
  }

  const ready = [...variables.entries()].filter(([, variable]) => variable.value.length > 0)
  const empty = [...variables.entries()].filter(([, variable]) => variable.value.length === 0)

  console.log(`Detected ${variables.size} unique variable(s) in ${envPath}.`)
  if (duplicateCount > 0) {
    console.log(`${duplicateCount} duplicate assignment(s) found; the last value for each key will be used.`)
  }
  if (empty.length > 0) {
    console.log(`${empty.length} empty variable(s) will be skipped.`)
  }

  console.log('\nVariables:')
  for (const [key, variable] of variables) {
    console.log(`  ${key}${variable.value.length === 0 ? ' (empty; skipped)' : ''}`)
  }

  if (ready.length === 0) {
    console.log('\nNo non-empty variables to upload.')
    return
  }

  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error('Confirmation requires an interactive terminal. No secrets were uploaded.')
  }

  if (!(await confirmUpload(ready.length))) {
    console.log('Cancelled. No secrets were uploaded.')
    return
  }

  for (const [key, variable] of ready) {
    console.log(`Uploading ${key}...`)
    await putSecret(key, variable.value)
  }

  console.log(`Uploaded ${ready.length} secret(s).`)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Failed to upload Cloudflare secrets.'
  console.error(message)
  process.exitCode = 1
})
