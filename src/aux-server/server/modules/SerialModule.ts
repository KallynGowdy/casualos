import { AuxModule2, Simulation } from '@casual-simulation/aux-vm';
import {
    DeviceInfo,
    remoteResult,
    remoteError,
} from '@casual-simulation/causal-trees';
import { Subscription } from 'rxjs';
import { flatMap } from 'rxjs/operators';
import {
    SerialConnectAction,
    SerialStreamAction,
    SerialOpenAction,
    SerialUpdateAction,
    SerialWriteAction,
    SerialReadAction,
    SerialCloseAction,
    SerialFlushAction,
    SerialDrainAction,
    SerialPauseAction,
    SerialResumeAction,
    asyncResult,
    asyncError,
    hasValue,
} from '@casual-simulation/aux-common';
import { Callback } from 'redis';
const execSync = require('child_process').execSync;
const SerialPort = require('serialport');
const parsers = SerialPort.parsers;

let btSerial = new Map<string, typeof SerialPort>();

/**
 * Defines an AuxModule that adds Serial functionality to the module.
 */
export class SerialModule implements AuxModule2 {
    constructor() {}

    setChannelManager() {}

    async setup(simulation: Simulation): Promise<Subscription> {
        let sub = new Subscription();

        sub.add(
            simulation.localEvents
                .pipe(
                    flatMap(async (event) => {
                        if (event.type === 'serial_connect') {
                            await this._serialConnect(simulation, event);
                        }
                        if (event.type === 'serial_stream') {
                            await this._serialStream(simulation, event);
                        }
                        if (event.type === 'serial_open') {
                            await this._serialOpen(simulation, event);
                        }
                        if (event.type === 'serial_update') {
                            await this._serialUpdate(simulation, event);
                        }
                        if (event.type === 'serial_write') {
                            await this._serialWrite(simulation, event);
                        }
                        if (event.type === 'serial_read') {
                            await this._serialRead(simulation, event);
                        }
                        if (event.type === 'serial_close') {
                            await this._serialClose(simulation, event);
                        }
                        if (event.type === 'serial_flush') {
                            await this._serialFlush(simulation, event);
                        }
                        if (event.type === 'serial_drain') {
                            await this._serialDrain(simulation, event);
                        }
                        if (event.type === 'serial_pause') {
                            await this._serialPause(simulation, event);
                        }
                        if (event.type === 'serial_resume') {
                            await this._serialResume(simulation, event);
                        }
                    })
                )
                .subscribe()
        );
        return sub;
    }

    _serialConnect(simulation: Simulation, event: SerialConnectAction) {
        try {
            // TODO: Pass the device name through the webhook?

            // Complete the bluetooth connection before opening it up
            execSync(
                'curl -X POST -H "Content-Type: text/plain" --data "connect" $(ip route show | awk \'/default/ {print $3}\'):8090/post'
            );

            const port = new SerialPort(event.path, event.options);
            btSerial.set('Connection01', port);

            port.on('open', () => {
                simulation.helper.transaction(
                    hasValue(event.playerId)
                        ? remoteResult(
                              undefined,
                              { sessionId: event.playerId },
                              event.taskId
                          )
                        : asyncResult(event.taskId, undefined)
                );
            });
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialStream(simulation: Simulation, event: SerialStreamAction) {
        try {
            // TODO: Pass an event name and a conneciton name
            const port = btSerial.get('Connection01');

            // Use a `\r\n` as a line terminator
            const parser = new parsers.Readline({
                delimiter: '\r\n',
            });

            port.pipe(parser);
            parser.on('data', (data: string) => {
                simulation.helper.shout('onStreamData', null, data);
            });
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialOpen(simulation: Simulation, event: SerialOpenAction) {
        try {
            const port = btSerial.get('Connection01');
            port.open();
            port.on('open', () => {
                simulation.helper.transaction(
                    hasValue(event.playerId)
                        ? remoteResult(
                              undefined,
                              { sessionId: event.playerId },
                              event.taskId
                          )
                        : asyncResult(event.taskId, undefined)
                );
            });
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialUpdate(simulation: Simulation, event: SerialUpdateAction) {
        try {
            const port = btSerial.get('Connection01');
            port.update(event.options, event.cb);

            btSerial.set('Connection01', port);

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          undefined,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, undefined)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialWrite(simulation: Simulation, event: SerialWriteAction) {
        try {
            const port = btSerial.get('Connection01');
            port.write(event.data, event.encoding, () => {
                simulation.helper.transaction(
                    hasValue(event.playerId)
                        ? remoteResult(
                              undefined,
                              { sessionId: event.playerId },
                              event.taskId
                          )
                        : asyncResult(event.taskId, undefined)
                );
            });
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialRead(simulation: Simulation, event: SerialReadAction) {
        try {
            const port = btSerial.get('Connection01');
            let data = port.read(event.size);

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          data,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, data)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialClose(simulation: Simulation, event: SerialCloseAction) {
        try {
            // Send a command to kill the rfcomm process
            execSync(
                'curl -X POST -H "Content-Type: text/plain" --data "disconnect" $(ip route show | awk \'/default/ {print $3}\'):8090/post'
            );

            const port = btSerial.get('Connection01');
            port.close(event.cb);
            port.on('close', () => {
                simulation.helper.transaction(
                    hasValue(event.playerId)
                        ? remoteResult(
                              undefined,
                              { sessionId: event.playerId },
                              event.taskId
                          )
                        : asyncResult(event.taskId, undefined)
                );
            });
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialFlush(simulation: Simulation, event: SerialFlushAction) {
        try {
            const port = btSerial.get('Connection01');
            port.flush();

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          undefined,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, undefined)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialDrain(simulation: Simulation, event: SerialDrainAction) {
        try {
            const port = btSerial.get('Connection01');
            port.drain();

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          undefined,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, undefined)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialPause(simulation: Simulation, event: SerialPauseAction) {
        try {
            const port = btSerial.get('Connection01');
            port.pause();

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          undefined,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, undefined)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    _serialResume(simulation: Simulation, event: SerialResumeAction) {
        try {
            const port = btSerial.get('Connection01');
            port.resume();

            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteResult(
                          undefined,
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncResult(event.taskId, undefined)
            );
        } catch (error) {
            simulation.helper.transaction(
                hasValue(event.playerId)
                    ? remoteError(
                          {
                              error: 'failure',
                              exception: error.toString(),
                          },
                          { sessionId: event.playerId },
                          event.taskId
                      )
                    : asyncError(event.taskId, error)
            );
        }
    }
    async deviceConnected(
        simulation: Simulation,
        device: DeviceInfo
    ): Promise<void> {}

    async deviceDisconnected(
        simulation: Simulation,
        device: DeviceInfo
    ): Promise<void> {}
}
