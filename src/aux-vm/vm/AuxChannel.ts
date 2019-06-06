import { AuxConfig } from './AuxConfig';
import {
    LocalEvent,
    LocalEvents,
    PrecalculatedFilesState,
    FileEvent,
} from '@casual-simulation/aux-common';

/**
 * Defines an interface for the static members of an AUX.
 */
export interface AuxStatic {
    /**
     * Creates a new AUX using the given config.
     */
    new (config: AuxConfig): Aux;
}

/**
 * Defines an interface for an AUX.
 * That is, a channel that interfaces with the AUX file format in realtime.
 */
export interface Aux {
    /**
     * Initializes the AUX.
     * @param onLocalEvents The callback that should be triggered whenever a local event is emitted from the AUX.
     * @param onStateUpdated The callback that should be triggered whenever the files state is updated.
     */
    init(
        onLocalEvents: (events: LocalEvents[]) => void,
        onStateUpdated: (state: PrecalculatedFilesState) => void
    ): Promise<void>;

    /**
     * Sends the given list of files events to the AUX for processing.
     * @param events The events.
     */
    sendEvents(events: FileEvent[]): Promise<void>;
}
