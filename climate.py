import sys
import logging
import time

_LOGGER = logging.getLogger(__name__)

from .ae200 import AE200Functions

import voluptuous as vol
from homeassistant.components.climate import ClimateEntity, PLATFORM_SCHEMA
from homeassistant.components.climate.const import ClimateEntityFeature
from homeassistant.components.climate.const import HVACMode
from homeassistant.const import CONF_IP_ADDRESS, UnitOfTemperature, ATTR_TEMPERATURE
import homeassistant.helpers.config_validation as cv
from homeassistant.helpers.entity import generate_entity_id


PLATFORM_SCHEMA = PLATFORM_SCHEMA.extend({
    vol.Required("controller_id"): cv.string,
    vol.Required(CONF_IP_ADDRESS): cv.string
})

MIN_TEMP = 16
MAX_TEMP = 30

class Mode:
    Heat = "HEAT"
    Dry = "DRY"
    Cool = "COOL"
    Fan = "FAN"
    Auto = "AUTO"

ae200Functions = AE200Functions()


class AE200Device:
    def __init__(self, ipaddress: str, deviceid: str, name: str):
        self._ipaddress = ipaddress
        self._deviceid = deviceid
        self._name = name
        self._attributes = None
        self._info_lease_seconds = 10 # Allow data to refresh after 10s
    
        self._refresh_device_info()
            
    def __str__(self):
        return str(self._attributes)
        #return "Name: " + self._name + " ID: " + str(self._deviceid) + " BuildingID: " + str(self._buildingid)
        #return "Temp: " + str(self.getTemperature()) + ", RoomTemp: " + str(self.getRoomTemperature()) + ", FanSpeed: " + str(self.getFanSpeed()) + ", Mode: " + str(self.getMode()) + ", PowerOn: " + str(self.isPowerOn()) + ", Online: " + str(self.isOnline())

    def _refresh_device_info(self):
        self._attributes = None
        
        _LOGGER.debug(f"Refreshing device info: {self._ipaddress} - {self._deviceid} ({self._name})")

        self._attributes = ae200Functions.getDeviceInfo(self._ipaddress, self._deviceid)
        self._last_info_time_s = time.time()

        return True
    
    def _sendValue(self, key, value):
        _LOGGER.debug(f"Sending message to device: {self._ipaddress} - {self._deviceid} ({self._name}): {key}: {value}")

        self._attributes[key] = value
        ae200Functions.send(self._ipaddress, self._deviceid, {
            key: str(value)
        })
        
    
    def _get_info(self, key, default_value):
        if not self._is_info_valid():
            return default_value
        
        if key not in self._attributes:
            return default_value
        
        if (len(self._attributes[key]) == 0):
            return default_value
        
        return self._attributes[key]
    
    def _is_info_valid(self):
        if self._attributes == None:
            return self._refresh_device_info()
        
        if (time.time() - self._last_info_time_s) >= self._info_lease_seconds:
            return self._refresh_device_info()
            
        return True

    def _to_float(self, value):
        return float(value) if value != None else None
        
    def getID(self):
        return self._deviceid
        
    def getName(self):
        return self._name

    def getTemperature(self):
        return self._to_float(self._get_info("SetTemp", None))

    def getRoomTemperature(self):
        return self._to_float(self._get_info("InletTemp", None))

    def getMinTemp(self):
        mode = self.getMode()
        if mode == Mode.Heat:
            return self._to_float(self._get_info("HeatMin", MIN_TEMP))
        elif mode == Mode.Cool:
            return self._to_float(self._get_info("CoolMin", MIN_TEMP))
        elif mode == Mode.Dry:
            return MIN_TEMP
        elif mode == Mode.Fan:
            return MIN_TEMP
        else:
            return self._to_float(self._get_info("AutoMin", MIN_TEMP))

    def getMaxTemp(self):
        mode = self.getMode()
        if mode == Mode.Heat:
            return self._to_float(self._get_info("HeatMax", MAX_TEMP))
        elif mode == Mode.Cool:
            return self._to_float(self._get_info("CoolMax", MAX_TEMP))
        elif mode == Mode.Dry:
            return MAX_TEMP
        elif mode == Mode.Fan:
            return MAX_TEMP
        else:
            return self._to_float(self._get_info("AutoMax", MAX_TEMP))

    def getFanSpeed(self):
        return self._get_info("FanSpeed", None)
    
    def getMode(self):
        return self._get_info("Mode", Mode.Auto)

    def isPowerOn(self): #boolean
        return self._get_info("Drive", "OFF") == "ON"

        
    def setTemperature(self, temperature):
        if not self._is_info_valid():
            _LOGGER.error("Unable to set temperature: " + str(temperature))
            return False
            
        self._sendValue("SetTemp", str(temperature))
        return True

    def setFanSpeed(self, speed):
        if not self._is_info_valid():
            _LOGGER.error("Unable to set fan speed: " + str(speed))
            return False
            
        self._sendValue("FanSpeed", speed)
        return True
        
    def setMode(self, mode):
        if not self._is_info_valid():
            _LOGGER.error("Unable to set mode: " + str(mode))
            return
            
        self._sendValue("Mode", mode)

    def powerOn(self):
        if not self._is_info_valid():
            _LOGGER.error("Unable to powerOn")
            return False
            
        self._sendValue("Drive", "ON")
        return True
        
    def powerOff(self):
        if not self._is_info_valid():
            _LOGGER.error("Unable to powerOff")
            return False
            
        self._sendValue("Drive", "OFF")
        return True

# ---------------------------------------------------------------

class AE200:
    def __init__(self, ipaddress: str):
        self._ipaddress = ipaddress
        
    def getDevicesList(self):
        devices = []
        ae200Functions = AE200Functions()
        results = ae200Functions.getDevices(self._ipaddress)

        for result in results:
            devices.append(AE200Device(self._ipaddress, result["id"], result["name"]))

        return devices

# ---------------------------------------------------------------

class AE200Climate(ClimateEntity):

    def __init__(self, hass, device: AE200Device, controllerid: str):
        self._device = device
        self.entity_id = generate_entity_id("climate.{}", f"mitsubishi_ae_200_{controllerid}_{device.getName()}", None, hass)
        
        self._fan_modes = ['AUTO', 'LOW', 'MID2', 'MID1', 'HIGH']

        self._enable_turn_on_off_backwards_compatibility = False
        
    @property
    def supported_features(self):
        return (ClimateEntityFeature.TARGET_TEMPERATURE | ClimateEntityFeature.FAN_MODE | ClimateEntityFeature.TURN_OFF | ClimateEntityFeature.TURN_ON)

    @property
    def should_poll(self):
        return True

    def update(self):
        self._device._refresh_device_info()

    @property
    def name(self):
        return f"Climate Control {self._device.getName()}"

    @property
    def temperature_unit(self):
        return UnitOfTemperature.CELSIUS

    @property
    def current_temperature(self):
        return self._device.getRoomTemperature()

    @property
    def target_temperature(self):
        return self._device.getTemperature()

    @property
    def hvac_mode(self):
        if self._device.isPowerOn():
            if self._device.getMode() == Mode.Heat:
                return HVACMode.HEAT
            elif self._device.getMode() == Mode.Cool:
                return HVACMode.COOL
            elif self._device.getMode() == Mode.Dry:
                return HVACMode.DRY
            elif self._device.getMode() == Mode.Fan:
                return HVACMode.FAN_ONLY
            elif self._device.getMode() == Mode.Auto:
                return HVACMode.AUTO
                
        return HVACMode.OFF

    @property
    def hvac_modes(self):
        return [HVACMode.HEAT, HVACMode.COOL, HVACMode.DRY, HVACMode.FAN_ONLY, HVACMode.AUTO, HVACMode.OFF]

    def set_hvac_mode(self, operation_mode):
        if operation_mode == HVACMode.OFF:
            self._device.powerOff()
        else:
            self._device.powerOn()
            if operation_mode == HVACMode.HEAT:
                self._device.setMode(Mode.Heat)
            elif operation_mode == HVACMode.COOL:
                self._device.setMode(Mode.Cool)
            elif operation_mode == HVACMode.DRY:
                self._device.setMode(Mode.Dry)
            elif operation_mode == HVACMode.FAN_ONLY:
                self._device.setMode(Mode.Fan)
            elif operation_mode == HVACMode.AUTO:
                self._device.setMode(Mode.Auto)

        self.schedule_update_ha_state()

    @property
    def fan_mode(self):
        return self._device.getFanSpeed()
        
    @property
    def fan_modes(self):
        return self._fan_modes

    def set_fan_mode(self, fan_mode):
        self._device.setFanSpeed(fan_mode)
        self.schedule_update_ha_state()

    @property
    def min_temp(self):
        return self._device.getMinTemp()

    @property
    def max_temp(self):
        return self._device.getMaxTemp()

    def set_temperature(self, **kwargs):
        if kwargs.get(ATTR_TEMPERATURE) is not None:
            self._device.setTemperature(kwargs.get(ATTR_TEMPERATURE))
            
        self.schedule_update_ha_state()

    def turn_on(self):
        self._device.powerOn()
        self.schedule_update_ha_state()

    def turn_off(self):
        self._device.powerOff()
        self.schedule_update_ha_state()

# ---------------------------------------------------------------

def setup_platform(hass, config, add_devices, discovery_info=None):
    _LOGGER.debug("Adding component: AE200 ...")

    controllerid = config.get('controller_id')
    if controllerid is None:
        _LOGGER.error("Invalid controller_id !")
        return False

    ipaddress = config.get(CONF_IP_ADDRESS)

    if ipaddress is None:
        _LOGGER.error("Invalid ip address !")
        return False
        
    ae = AE200(ipaddress)
    
    device_list = []
    
    devices = ae.getDevicesList()
    for device in devices:
        _LOGGER.debug("Adding new device: " + device.getName())
        device_list.append( AE200Climate(hass, device, controllerid) )
    
    add_devices(device_list)
    
    _LOGGER.debug("Component successfully added ! (" + str(len(device_list)) + " device(s) found !)")
    return True

# ---------------------------------------------------------------

if __name__ == '__main__':

    logging.basicConfig(
        stream=sys.stdout,
        level=logging.DEBUG,
    )

    if len(sys.argv) < 3:
        print ("Usage: " + sys.argv[0] + " <ip address>")
        sys.exit(1)

    ae = AE200(sys.argv[1])
    
    devices = ae.getDevicesList()
    for device in devices:
        print (device)
