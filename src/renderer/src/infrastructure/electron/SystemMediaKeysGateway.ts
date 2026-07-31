import type {Unsubscribe} from '@api/types/common';
import type {SystemMediaKeyAction} from '@api/types/electron';
import {ElectronNamespaceAdapter} from './ElectronBridge';

class SystemMediaKeysGateway extends ElectronNamespaceAdapter<'systemMediaKeys'> {
    constructor() {
        super('systemMediaKeys');
    }

    setEnabled(enabled: boolean): Promise<boolean> {
        return this.call('setEnabled', enabled);
    }

    onTriggered(
        handler: (event: unknown, action: SystemMediaKeyAction) => void
    ): Unsubscribe {
        return this.on('onTriggered', handler);
    }
}

export const systemMediaKeysGateway = new SystemMediaKeysGateway();

