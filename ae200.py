import logging
import asyncio
import websockets
from websockets.extensions import permessage_deflate
import xml.etree.ElementTree as ET
from pprint import pprint


# logging.basicConfig(
#     format="%(asctime)s %(message)s",
#     level=logging.INFO,
# )

getUnitsPayload = """<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>getRequest</Command>
<DatabaseManager>
<ControlGroup>
<MnetList />
</ControlGroup>
</DatabaseManager>
</Packet>
"""

def getMnetDetails(deviceIds):
    mnets = "\n".join([f'<Mnet Group="{deviceId}" Drive="*" Vent24h="*" Mode="*" VentMode="*" ModeStatus="*" SetTemp="*" SetTemp1="*" SetTemp2="*" SetTemp3="*" SetTemp4="*" SetTemp5="*" SetHumidity="*" InletTemp="*" InletHumidity="*" AirDirection="*" FanSpeed="*" RemoCon="*" DriveItem="*" ModeItem="*" SetTempItem="*" FilterItem="*" AirDirItem="*" FanSpeedItem="*" TimerItem="*" CheckWaterItem="*" FilterSign="*" Hold="*" EnergyControl="*" EnergyControlIC="*" SetbackControl="*" Ventilation="*" VentiDrive="*" VentiFan="*" Schedule="*" ScheduleAvail="*" ErrorSign="*" CheckWater="*" TempLimitCool="*" TempLimitHeat="*" TempLimit="*" CoolMin="*" CoolMax="*" HeatMin="*" HeatMax="*" AutoMin="*" AutoMax="*" TurnOff="*" MaxSaveValue="*" RoomHumidity="*" Brightness="*" Occupancy="*" NightPurge="*" Humid="*" Vent24hMode="*" SnowFanMode="*" InletTempHWHP="*" OutletTempHWHP="*" HeadTempHWHP="*" OutdoorTemp="*" BrineTemp="*" HeadInletTempCH="*" BACnetTurnOff="*" AISmartStart="*"  />' for deviceId in deviceIds])
    return f"""<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>getRequest</Command>
<DatabaseManager>
{mnets}
</DatabaseManager>
</Packet>
"""

class AE200Functions:
    def __init__(self):
        self._json = None
        self._temp_list = []

    async def getDevicesAsync(self, address):
        async with websockets.connect(
                f"ws://{address}/b_xmlproc/",
                extensions=[permessage_deflate.ClientPerMessageDeflateFactory()],
                origin=f'http://{address}',
                subprotocols=['b_xmlproc']
            ) as websocket:

            await websocket.send(getUnitsPayload)
            unitsResultStr = await websocket.recv()
            unitsResultXML = ET.fromstring(unitsResultStr)

            groupList = []
            for r in unitsResultXML.findall('./DatabaseManager/ControlGroup/MnetList/MnetRecord'):
                groupList.append({
                    "id": r.get('Group'),
                    "name": r.get('GroupNameWeb')
                })

            await websocket.close()

            return groupList

    def getDevices(self, address):
        return asyncio.run(self.getDevicesAsync(address))


    async def getDeviceInfoAsync(self, address, deviceId):
        async with websockets.connect(
                f"ws://{address}/b_xmlproc/",
                extensions=[permessage_deflate.ClientPerMessageDeflateFactory()],
                origin=f'http://{address}',
                subprotocols=['b_xmlproc']
            ) as websocket:

            getMnetDetailsPayload = getMnetDetails([deviceId])
            await websocket.send(getMnetDetailsPayload)
            mnetDetailsResultStr = await websocket.recv()
            mnetDetailsResultXML = ET.fromstring(mnetDetailsResultStr)

            result = {}
            node = mnetDetailsResultXML.find('./DatabaseManager/Mnet')

            await websocket.close()

            return node.attrib

    def getDeviceInfo(self, address, deviceId):
        return asyncio.run(self.getDeviceInfoAsync(address, deviceId))


    async def sendAsync(self, address, deviceId, attributes):
        async with websockets.connect(
                f"ws://{address}/b_xmlproc/",
                extensions=[permessage_deflate.ClientPerMessageDeflateFactory()],
                origin=f'http://{address}',
                subprotocols=['b_xmlproc']
            ) as websocket:

            attrs = " ".join([f'{key}="{attributes[key]}"' for key in attributes])
            payload = f"""<?xml version="1.0" encoding="UTF-8" ?>
<Packet>
<Command>setRequest</Command>
<DatabaseManager>
<Mnet Group="{deviceId}" {attrs}  />
</DatabaseManager>
</Packet>
"""
            await websocket.send(payload)

            await websocket.close()

    def send(self, address, deviceId, attributes):
        return asyncio.run(self.sendAsync(address, deviceId, attributes))


if __name__ == "__main__":
    d = AE200Functions()
    address = "192.168.1.10"
    
    # Test reading device list
    # pprint(d.getDevices(address))

    # Test reading info for device 6
    # pprint(d.getDeviceInfo(address, "6"))

    # Test turning off device 6
    # d.send(address, "6", {
    #     "Drive": "OFF"
    # })
