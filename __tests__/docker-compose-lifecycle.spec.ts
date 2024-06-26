import path from 'path'
import {fileURLToPath} from 'url'
import {jest, describe, it, expect, beforeAll, afterAll} from '@jest/globals'
import dockerCompose from '../src/docker-compose-testkit.js'

jest.setTimeout(30 * 1000)

describe('docker-compose-lifecycle', () => {
  describe('runService', () => {
    const pathToCompose = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'docker-compose-fixture.yml',
    )
    const compose = dockerCompose(pathToCompose, {
      forceKill: true,
      env: {
        TEST_ENV_VAR: 'hello world',
        FIXTURE: 'exit2',
      },
    })

    beforeAll(compose.setup)
    afterAll(compose.teardown)

    it('should run a command in a service', async () => {
      const result = await compose.runService('node', [
        'node',
        '/fixtures/exit2.js',
        '0',
        'hello world',
      ])

      expect(result.stdout).toEqual('hello world')
    })

    it('should run a failing command in a service', async () => {
      try {
        await compose.runService('node', ['node', '/fixtures/exit2.js', '3', 'error message'])
      } catch (err) {
        const error = err as any
        expect(error.exitCode).toBe(3)
        expect(error.stderr).toEqual('error message')
      }
    })

    it('should pass the setup env vars to the service', async () => {
      const result = await compose.runService('node', ['node', '/fixtures/env.js'])

      expect(JSON.parse(result.stdout)).toMatchObject({
        TEST_ENV_VAR: 'hello world',
      })
    })
  })

  describe('execInService', () => {
    const pathToCompose = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'docker-compose.yml',
    )
    const compose = dockerCompose(pathToCompose, {
      forceKill: true,
    })

    beforeAll(compose.setup)
    afterAll(compose.teardown)

    it('should exec a command in a service', async () => {
      const pwdResult = await compose.execInService('nginx', ['pwd'])
      expect(pwdResult.stdout).toEqual('/')
      const lsResult = await compose.execInService('nginx', ['ls'])
      expect(lsResult.stdout).toMatch(new RegExp(`^bin\nboot\ndev\ndocker-entrypoint\.d.*`, 'g'))
    })

    it('should exec a failing command in a service', async () => {
      try {
        await compose.execInService('nginx', ['cat', 'blabla'])
      } catch (err) {
        const error = err as any
        expect(error.exitCode).toBe(1)
        expect(error.stderr).toEqual('cat: blabla: No such file or directory')
      }
    })
  })

  describe('waitForServiceToExit', () => {
    it('should wait until the service exits', async () => {
      const pathToCompose = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'docker-compose-fixture-exit.yml',
      )
      const compose = dockerCompose(pathToCompose, {
        forceKill: true,
        env: {
          FIXTURE: 'logs',
          FIXTURE_SECOND: 'exit',
          EXIT_CODE: '0',
        },
      })

      await compose.setup()
      await compose.waitForServiceToExit('second')
      await compose.teardown()
    })

    it('should throw if a service exited with exit code different than 1', async () => {
      const pathToCompose = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'docker-compose-fixture-exit.yml',
      )
      const compose = dockerCompose(pathToCompose, {
        forceKill: true,
        env: {
          FIXTURE: 'logs',
          FIXTURE_SECOND: 'exit',
          EXIT_CODE: '1',
        },
      })

      await compose.setup()
      try {
        await compose.waitForServiceToExit('second')
      } catch (err) {
        const error = err as any
        const messages = error.message.split('\n')
        expect(messages[0]).toEqual('Service exited with exit code 1:')
        expect(messages[1]).toMatch(
          new RegExp(`${compose.projectName}-second-1  | exit code is set to: 1`),
        )
        expect(messages[2]).toMatch(new RegExp(`${compose.projectName}-second-1  | stdout`))
        expect(messages[3]).toMatch(new RegExp(`${compose.projectName}-second-1  | stderr`))
      }
      await compose.teardown()
      expect.assertions(4)
    })

    it('should throw if service failed to exit within the timeout', async () => {
      const pathToCompose = path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'docker-compose-fixture-exit.yml',
      )
      const compose = dockerCompose(pathToCompose, {
        forceKill: true,
        env: {
          FIXTURE: 'logs',
          FIXTURE_SECOND: 'exit3',
        },
      })

      await compose.setup()
      try {
        await compose.waitForServiceToExit('second', {timeout: 3000})
      } catch (err) {
        const error = err as any
        expect(error.message).toEqual('Service is still running')
      }
      await compose.teardown()
      expect.assertions(1)
    })
  })
})
