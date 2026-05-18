const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { RufloService } = require('../src/services/ruflo-service');

async function run() {
  const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ruflo-service-'));
  const workspaceCwd = path.join(tempHome, 'workspace-demo');
  fs.mkdirSync(workspaceCwd, { recursive: true });
  let daemonRunning = false;

  const execAsync = async (command) => {
    if (command === 'claude-flow --version') {
      return { stdout: 'ruflo v3.7.0-alpha.42', stderr: '' };
    }

    if (command === 'claude-flow daemon status') {
      return {
        stdout: daemonRunning
          ? [
              '+---- RuFlo Daemon ----+',
              '| Status: ● RUNNING    |',
              '| PID: 4242            |',
              '| Workers Enabled: 5   |'
            ].join('\n')
          : [
              '+---- RuFlo Daemon ----+',
              '| Status: ○ STOPPED    |',
              '| PID: 4242            |',
              '| Workers Enabled: 5   |'
            ].join('\n'),
        stderr: ''
      };
    }

    if (command === 'claude-flow daemon start') {
      daemonRunning = true;
      return { stdout: 'started', stderr: '' };
    }

    if (command === 'claude-flow daemon stop') {
      daemonRunning = false;
      return { stdout: 'stopped', stderr: '' };
    }

    if (command === 'claude-flow doctor') {
      return { stdout: 'doctor ok', stderr: '' };
    }

    if (command === 'claude-flow memory init') {
      const memoryDir = path.join(workspaceCwd, '.swarm');
      fs.mkdirSync(memoryDir, { recursive: true });
      fs.writeFileSync(path.join(memoryDir, 'memory.db'), '');
      return { stdout: 'memory ready', stderr: '' };
    }

    if (command === 'claude-flow mcp tools --format json') {
      return {
        stdout: JSON.stringify([
          { name: 'swarm_init', category: 'swarm', enabled: true },
          { name: 'agent_spawn', category: 'agent', enabled: true }
        ]),
        stderr: ''
      };
    }

    throw new Error(`Unexpected command: ${command}`);
  };

  try {
    const service = new RufloService({ home: tempHome, execAsync });
    const firstStatus = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(firstStatus.installed, true);
    assert.strictEqual(firstStatus.reason, 'mcpMissing');
    assert.strictEqual(firstStatus.daemonWorkersEnabled, '5');

    const registerResult = service.registerWorkspaceMcp(workspaceCwd);
    assert.strictEqual(registerResult.ok, true);

    const afterRegister = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(afterRegister.mcpRegistered, true);
    assert.strictEqual(afterRegister.reason, 'memoryMissing');

    const memoryResult = await service.initializeMemory(workspaceCwd);
    assert.strictEqual(memoryResult.ok, true);

    const afterMemory = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(afterMemory.memoryInitialized, true);
    assert.strictEqual(afterMemory.reason, 'daemonStopped');

    const memoryAgain = await service.initializeMemory(workspaceCwd);
    assert.strictEqual(memoryAgain.skipped, true);

    fs.writeFileSync(`${afterMemory.memoryPath}-wal`, '');
    fs.writeFileSync(`${afterMemory.memoryPath}-shm`, '');
    const deleteMemoryResult = service.deleteMemory(workspaceCwd);
    assert.strictEqual(deleteMemoryResult.ok, true);
    assert.strictEqual(fs.existsSync(afterMemory.memoryPath), false);
    assert.strictEqual(fs.existsSync(`${afterMemory.memoryPath}-wal`), false);
    assert.strictEqual(fs.existsSync(`${afterMemory.memoryPath}-shm`), false);

    const afterDeleteMemory = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(afterDeleteMemory.memoryInitialized, false);
    assert.strictEqual(afterDeleteMemory.reason, 'memoryMissing');

    const memoryAfterDelete = await service.initializeMemory(workspaceCwd);
    assert.strictEqual(memoryAfterDelete.ok, true);

    const stopResult = await service.stopDaemon(workspaceCwd);
    assert.strictEqual(stopResult.ok, true);

    const activationResult = await service.activateWorkspace(workspaceCwd);
    assert.strictEqual(activationResult.ok, true);

    const afterStart = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(afterStart.daemonRunning, true);
    assert.strictEqual(afterStart.daemonPid, '4242');
    assert.strictEqual(afterStart.reason, 'ready');

    const doctorResult = await service.runDoctor(workspaceCwd);
    assert.strictEqual(doctorResult.ok, true);

    const toolCatalog = await service.getToolCatalog();
    assert.strictEqual(toolCatalog.ok, true);
    assert.strictEqual(toolCatalog.tools.length, 2);

    const removeResult = service.removeWorkspaceMcp(workspaceCwd);
    assert.strictEqual(removeResult.ok, true);

    const afterRemove = await service.getStatus({ workspaceCwd, force: true });
    assert.strictEqual(afterRemove.mcpRegistered, false);
    assert.strictEqual(afterRemove.reason, 'mcpMissing');

    console.log('ruflo service smoke passed');
  } finally {
    fs.rmSync(tempHome, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
