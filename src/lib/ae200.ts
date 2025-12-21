/**
 * AE200 Communication Module
 * Handles WebSocket communication with Mitsubishi AE-200 controllers
 */

import WebSocket from 'ws';
import { parseStringPromise, Builder } from 'xml2js';

// XML Payloads
const GET_UNITS_PAYLOAD = `<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>getRequest</Command>
<DatabaseManager>
<ControlGroup>
<MnetList />
</ControlGroup>
</DatabaseManager>
</Packet>`;

/**
 * Device information returned from AE-200
 */
export interface DeviceInfo {
    id: string;
    name: string;
}

/**
 * Device attributes/state
 */
export interface DeviceAttributes {
    Group?: string;
    Drive?: 'ON' | 'OFF';
    Mode?: 'HEAT' | 'DRY' | 'COOL' | 'FAN' | 'AUTO';
    ModeStatus?: string;
    SetTemp?: string;
    InletTemp?: string;
    FanSpeed?: 'AUTO' | 'LOW' | 'MID2' | 'MID1' | 'HIGH';
    AirDirection?: string;
    FilterSign?: string;
    ErrorSign?: string;
    RoomHumidity?: string;
    InletHumidity?: string;
    SetHumidity?: string;
    CoolMin?: string;
    CoolMax?: string;
    HeatMin?: string;
    HeatMax?: string;
    AutoMin?: string;
    AutoMax?: string;
    [key: string]: string | undefined;
}

/**
 * Generate XML payload for getting device details
 */
function getMnetDetailsPayload(deviceIds: string[]): string {
    const mnets = deviceIds.map(deviceId =>
        `<Mnet Group="${deviceId}" Drive="*" Vent24h="*" Mode="*" VentMode="*" ModeStatus="*" ` +
        `SetTemp="*" SetTemp1="*" SetTemp2="*" SetTemp3="*" SetTemp4="*" SetTemp5="*" ` +
        `SetHumidity="*" InletTemp="*" InletHumidity="*" AirDirection="*" FanSpeed="*" ` +
        `RemoCon="*" DriveItem="*" ModeItem="*" SetTempItem="*" FilterItem="*" ` +
        `AirDirItem="*" FanSpeedItem="*" TimerItem="*" CheckWaterItem="*" FilterSign="*" ` +
        `Hold="*" EnergyControl="*" EnergyControlIC="*" SetbackControl="*" Ventilation="*" ` +
        `VentiDrive="*" VentiFan="*" Schedule="*" ScheduleAvail="*" ErrorSign="*" ` +
        `CheckWater="*" TempLimitCool="*" TempLimitHeat="*" TempLimit="*" CoolMin="*" ` +
        `CoolMax="*" HeatMin="*" HeatMax="*" AutoMin="*" AutoMax="*" TurnOff="*" ` +
        `MaxSaveValue="*" RoomHumidity="*" Brightness="*" Occupancy="*" NightPurge="*" ` +
        `Humid="*" Vent24hMode="*" SnowFanMode="*" InletTempHWHP="*" OutletTempHWHP="*" ` +
        `HeadTempHWHP="*" OutdoorTemp="*" BrineTemp="*" HeadInletTempCH="*" BACnetTurnOff="*" ` +
        `AISmartStart="*" />`
    ).join('\n');

    return `<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>getRequest</Command>
<DatabaseManager>
${mnets}
</DatabaseManager>
</Packet>`;
}

/**
 * Generate XML payload for setting device attributes
 */
function getSetPayload(deviceId: string, attributes: Record<string, string>): string {
    const attrs = Object.entries(attributes)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ');

    return `<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>setRequest</Command>
<DatabaseManager>
<Mnet Group="${deviceId}" ${attrs} />
</DatabaseManager>
</Packet>`;
}

/**
 * AE200 Communication Class
 */
export class AE200Client {
    private address: string;
    private timeout: number;
    private log: ioBroker.Logger;

    constructor(address: string, log: ioBroker.Logger, timeout: number = 10000) {
        this.address = address;
        this.timeout = timeout;
        this.log = log;
    }

    /**
     * Send a WebSocket message and wait for response
     */
    private async sendMessage(payload: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(`ws://${this.address}/b_xmlproc/`, ['b_xmlproc'], {
                origin: `http://${this.address}`,
                perMessageDeflate: true,
                handshakeTimeout: this.timeout
            });

            const timeoutHandle = setTimeout(() => {
                ws.terminate();
                reject(new Error('Connection timeout'));
            }, this.timeout);

            ws.on('open', () => {
                this.log.debug(`WebSocket connected to ${this.address}`);
                ws.send(payload);
            });

            ws.on('message', (data: WebSocket.Data) => {
                clearTimeout(timeoutHandle);
                const response = data.toString();
                this.log.debug(`Received response: ${response.substring(0, 200)}...`);
                ws.close();
                resolve(response);
            });

            ws.on('error', (error: Error) => {
                clearTimeout(timeoutHandle);
                this.log.error(`WebSocket error: ${error.message}`);
                reject(error);
            });

            ws.on('close', () => {
                this.log.debug('WebSocket connection closed');
            });
        });
    }

    /**
     * Get list of all devices connected to the AE-200 controller
     */
    async getDevices(): Promise<DeviceInfo[]> {
        try {
            const response = await this.sendMessage(GET_UNITS_PAYLOAD);
            const result = await parseStringPromise(response, { explicitArray: false });

            const devices: DeviceInfo[] = [];
            const mnetList = result?.Packet?.DatabaseManager?.ControlGroup?.MnetList?.MnetRecord;

            if (!mnetList) {
                this.log.warn('No devices found in response');
                return devices;
            }

            // Handle single device or array of devices
            const records = Array.isArray(mnetList) ? mnetList : [mnetList];

            for (const record of records) {
                if (record.$ && record.$.Group) {
                    devices.push({
                        id: record.$.Group,
                        name: record.$.GroupNameWeb || `Device ${record.$.Group}`
                    });
                }
            }

            this.log.info(`Found ${devices.length} device(s)`);
            return devices;
        } catch (error) {
            this.log.error(`Failed to get devices: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Get detailed information for a specific device
     */
    async getDeviceInfo(deviceId: string): Promise<DeviceAttributes> {
        try {
            const payload = getMnetDetailsPayload([deviceId]);
            const response = await this.sendMessage(payload);
            const result = await parseStringPromise(response, { explicitArray: false });

            const mnet = result?.Packet?.DatabaseManager?.Mnet;

            if (!mnet || !mnet.$) {
                throw new Error(`No device info found for device ${deviceId}`);
            }

            this.log.debug(`Device ${deviceId} info retrieved`);
            return mnet.$ as DeviceAttributes;
        } catch (error) {
            this.log.error(`Failed to get device info for ${deviceId}: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Set attributes on a device
     */
    async setDeviceAttribute(deviceId: string, attributes: Record<string, string>): Promise<void> {
        try {
            const payload = getSetPayload(deviceId, attributes);
            this.log.debug(`Setting device ${deviceId} attributes: ${JSON.stringify(attributes)}`);
            await this.sendMessage(payload);
            this.log.info(`Device ${deviceId} attributes set successfully`);
        } catch (error) {
            this.log.error(`Failed to set device ${deviceId} attributes: ${(error as Error).message}`);
            throw error;
        }
    }

    /**
     * Test connection to the AE-200 controller
     */
    async testConnection(): Promise<boolean> {
        try {
            await this.getDevices();
            return true;
        } catch {
            return false;
        }
    }
}
