/**
 * Mitsubishi AE-200 ioBroker Adapter
 *
 * Controls Mitsubishi AE-200 HVAC systems via WebSocket
 */

import * as utils from '@iobroker/adapter-core';
import { AE200Client, DeviceAttributes, DeviceInfo } from './lib/ae200';

// Constants
const MIN_TEMP = 16;
const MAX_TEMP = 30;

const MODES = ['HEAT', 'DRY', 'COOL', 'FAN', 'AUTO'] as const;
const FAN_SPEEDS = ['AUTO', 'LOW', 'MID2', 'MID1', 'HIGH'] as const;

type Mode = typeof MODES[number];
type FanSpeed = typeof FAN_SPEEDS[number];

interface AdapterConfig {
    ipAddress: string;
    pollingInterval: number;
}

class MitsubishiAE200 extends utils.Adapter {
    private client: AE200Client | null = null;
    private pollingTimer: ioBroker.Timeout | null = null;
    private devices: Map<string, DeviceInfo> = new Map();

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({
            ...options,
            name: 'mitsubishi-ae200',
        });

        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Adapter startup
     */
    private async onReady(): Promise<void> {
        const config = this.config as AdapterConfig;

        // Validate configuration
        if (!config.ipAddress) {
            this.log.error('No IP address configured!');
            this.setState('info.connection', false, true);
            return;
        }

        this.log.info(`Starting Mitsubishi AE-200 adapter for ${config.ipAddress}`);

        // Initialize client
        this.client = new AE200Client(config.ipAddress, this.log);

        // Test connection and discover devices
        try {
            const connected = await this.client.testConnection();
            if (!connected) {
                this.log.error('Failed to connect to AE-200 controller');
                this.setState('info.connection', false, true);
                return;
            }

            this.setState('info.connection', true, true);
            this.log.info('Successfully connected to AE-200 controller');

            // Discover and create device objects
            await this.discoverDevices();

            // Start polling
            this.startPolling(config.pollingInterval || 30);

        } catch (error) {
            this.log.error(`Initialization error: ${(error as Error).message}`);
            this.setState('info.connection', false, true);
        }
    }

    /**
     * Discover devices and create ioBroker objects
     */
    private async discoverDevices(): Promise<void> {
        if (!this.client) return;

        try {
            const deviceList = await this.client.getDevices();
            this.log.info(`Discovered ${deviceList.length} device(s)`);

            // Create devices channel
            await this.setObjectNotExistsAsync('devices', {
                type: 'channel',
                common: {
                    name: 'Devices',
                },
                native: {},
            });

            for (const device of deviceList) {
                this.devices.set(device.id, device);
                await this.createDeviceObjects(device);
            }

            // Initial poll
            await this.pollDevices();

        } catch (error) {
            this.log.error(`Device discovery failed: ${(error as Error).message}`);
        }
    }

    /**
     * Create ioBroker objects for a device
     */
    private async createDeviceObjects(device: DeviceInfo): Promise<void> {
        const devicePath = `devices.${device.id}`;

        // Device channel
        await this.setObjectNotExistsAsync(devicePath, {
            type: 'channel',
            common: {
                name: device.name,
            },
            native: {
                id: device.id,
            },
        });

        // Device states
        const states: { id: string; common: ioBroker.StateCommon }[] = [
            {
                id: 'name',
                common: {
                    name: 'Device name',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: false,
                },
            },
            {
                id: 'power',
                common: {
                    name: 'Power',
                    type: 'boolean',
                    role: 'switch.power',
                    read: true,
                    write: true,
                },
            },
            {
                id: 'mode',
                common: {
                    name: 'Mode',
                    type: 'string',
                    role: 'level.mode.hvac',
                    read: true,
                    write: true,
                    states: {
                        'HEAT': 'Heat',
                        'DRY': 'Dry',
                        'COOL': 'Cool',
                        'FAN': 'Fan',
                        'AUTO': 'Auto',
                    },
                },
            },
            {
                id: 'targetTemperature',
                common: {
                    name: 'Target temperature',
                    type: 'number',
                    role: 'level.temperature',
                    read: true,
                    write: true,
                    min: MIN_TEMP,
                    max: MAX_TEMP,
                    unit: '°C',
                },
            },
            {
                id: 'currentTemperature',
                common: {
                    name: 'Current temperature',
                    type: 'number',
                    role: 'value.temperature',
                    read: true,
                    write: false,
                    unit: '°C',
                },
            },
            {
                id: 'fanSpeed',
                common: {
                    name: 'Fan speed',
                    type: 'string',
                    role: 'level.mode.fan',
                    read: true,
                    write: true,
                    states: {
                        'AUTO': 'Auto',
                        'LOW': 'Low',
                        'MID2': 'Medium-Low',
                        'MID1': 'Medium-High',
                        'HIGH': 'High',
                    },
                },
            },
            {
                id: 'humidity',
                common: {
                    name: 'Room humidity',
                    type: 'number',
                    role: 'value.humidity',
                    read: true,
                    write: false,
                    unit: '%',
                },
            },
            {
                id: 'filterSign',
                common: {
                    name: 'Filter needs replacement',
                    type: 'boolean',
                    role: 'indicator.maintenance',
                    read: true,
                    write: false,
                },
            },
            {
                id: 'errorSign',
                common: {
                    name: 'Error detected',
                    type: 'boolean',
                    role: 'indicator.error',
                    read: true,
                    write: false,
                },
            },
            {
                id: 'airDirection',
                common: {
                    name: 'Air direction',
                    type: 'string',
                    role: 'text',
                    read: true,
                    write: true,
                },
            },
        ];

        for (const state of states) {
            await this.setObjectNotExistsAsync(`${devicePath}.${state.id}`, {
                type: 'state',
                common: state.common,
                native: {},
            });
        }

        // Set static name
        await this.setStateAsync(`${devicePath}.name`, device.name, true);

        // Subscribe to writable states
        await this.subscribeStatesAsync(`${devicePath}.power`);
        await this.subscribeStatesAsync(`${devicePath}.mode`);
        await this.subscribeStatesAsync(`${devicePath}.targetTemperature`);
        await this.subscribeStatesAsync(`${devicePath}.fanSpeed`);
        await this.subscribeStatesAsync(`${devicePath}.airDirection`);
    }

    /**
     * Update device states from AE-200
     */
    private async updateDeviceStates(deviceId: string, attrs: DeviceAttributes): Promise<void> {
        const devicePath = `devices.${deviceId}`;

        // Power
        if (attrs.Drive !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.power`, attrs.Drive === 'ON', true);
        }

        // Mode
        if (attrs.Mode !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.mode`, attrs.Mode, true);
        }

        // Target temperature
        if (attrs.SetTemp !== undefined && attrs.SetTemp !== '') {
            const temp = parseFloat(attrs.SetTemp);
            if (!isNaN(temp)) {
                await this.setStateChangedAsync(`${devicePath}.targetTemperature`, temp, true);
            }
        }

        // Current temperature
        if (attrs.InletTemp !== undefined && attrs.InletTemp !== '') {
            const temp = parseFloat(attrs.InletTemp);
            if (!isNaN(temp)) {
                await this.setStateChangedAsync(`${devicePath}.currentTemperature`, temp, true);
            }
        }

        // Fan speed
        if (attrs.FanSpeed !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.fanSpeed`, attrs.FanSpeed, true);
        }

        // Humidity
        if (attrs.RoomHumidity !== undefined && attrs.RoomHumidity !== '') {
            const humidity = parseFloat(attrs.RoomHumidity);
            if (!isNaN(humidity)) {
                await this.setStateChangedAsync(`${devicePath}.humidity`, humidity, true);
            }
        }

        // Filter sign
        if (attrs.FilterSign !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.filterSign`, attrs.FilterSign === 'ON', true);
        }

        // Error sign
        if (attrs.ErrorSign !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.errorSign`, attrs.ErrorSign === 'ON', true);
        }

        // Air direction
        if (attrs.AirDirection !== undefined) {
            await this.setStateChangedAsync(`${devicePath}.airDirection`, attrs.AirDirection, true);
        }
    }

    /**
     * Poll all devices for current state
     */
    private async pollDevices(): Promise<void> {
        if (!this.client) return;

        for (const [deviceId] of this.devices) {
            try {
                const attrs = await this.client.getDeviceInfo(deviceId);
                await this.updateDeviceStates(deviceId, attrs);
            } catch (error) {
                this.log.warn(`Failed to poll device ${deviceId}: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Start polling timer
     */
    private startPolling(intervalSeconds: number): void {
        this.log.info(`Starting polling with ${intervalSeconds}s interval`);

        this.pollingTimer = this.setInterval(async () => {
            try {
                await this.pollDevices();
                this.setState('info.connection', true, true);
            } catch (error) {
                this.log.error(`Polling error: ${(error as Error).message}`);
                this.setState('info.connection', false, true);
            }
        }, intervalSeconds * 1000);
    }

    /**
     * Handle state changes from ioBroker
     */
    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack || !this.client) {
            return;
        }

        // Parse state ID: mitsubishi-ae200.0.devices.{deviceId}.{property}
        const parts = id.split('.');
        if (parts.length < 5 || parts[2] !== 'devices') {
            return;
        }

        const deviceId = parts[3];
        const property = parts[4];

        this.log.debug(`State change: device=${deviceId}, property=${property}, value=${state.val}`);

        try {
            switch (property) {
                case 'power':
                    await this.client.setDeviceAttribute(deviceId, {
                        Drive: state.val ? 'ON' : 'OFF',
                    });
                    break;

                case 'mode':
                    if (MODES.includes(state.val as Mode)) {
                        await this.client.setDeviceAttribute(deviceId, {
                            Mode: state.val as string,
                        });
                    } else {
                        this.log.warn(`Invalid mode: ${state.val}`);
                    }
                    break;

                case 'targetTemperature':
                    const temp = Number(state.val);
                    if (!isNaN(temp) && temp >= MIN_TEMP && temp <= MAX_TEMP) {
                        await this.client.setDeviceAttribute(deviceId, {
                            SetTemp: String(temp),
                        });
                    } else {
                        this.log.warn(`Invalid temperature: ${state.val}`);
                    }
                    break;

                case 'fanSpeed':
                    if (FAN_SPEEDS.includes(state.val as FanSpeed)) {
                        await this.client.setDeviceAttribute(deviceId, {
                            FanSpeed: state.val as string,
                        });
                    } else {
                        this.log.warn(`Invalid fan speed: ${state.val}`);
                    }
                    break;

                case 'airDirection':
                    await this.client.setDeviceAttribute(deviceId, {
                        AirDirection: String(state.val),
                    });
                    break;

                default:
                    this.log.debug(`Unhandled property: ${property}`);
            }

            // Refresh device state after change
            setTimeout(async () => {
                try {
                    const attrs = await this.client!.getDeviceInfo(deviceId);
                    await this.updateDeviceStates(deviceId, attrs);
                } catch (error) {
                    this.log.warn(`Failed to refresh device ${deviceId}: ${(error as Error).message}`);
                }
            }, 1000);

        } catch (error) {
            this.log.error(`Failed to set ${property} on device ${deviceId}: ${(error as Error).message}`);
        }
    }

    /**
     * Adapter shutdown
     */
    private onUnload(callback: () => void): void {
        try {
            if (this.pollingTimer) {
                this.clearInterval(this.pollingTimer);
                this.pollingTimer = null;
            }

            this.setState('info.connection', false, true);
            this.log.info('Adapter stopped');

            callback();
        } catch (error) {
            callback();
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    module.exports = (options: Partial<utils.AdapterOptions> | undefined) => new MitsubishiAE200(options);
} else {
    // Otherwise start the instance directly
    (() => new MitsubishiAE200())();
}
