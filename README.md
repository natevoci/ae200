# HomeAssistant - Mitsubishi AE200

Add to home assistant support for mitsubishi AE-200 air conditioner controller

## Installing

- Create a new folder in your home assistant : <config_dir>/custom_components/ae200/
- Copy everything from GIT to your local folder <config_dir>/custom_components/ae200/

Edit configuration.yaml and add below lines:

```	
climate:
  - platform: ae200
    controller_id: name_of_controller  # used as part of entity id's
    ip_address: <ip_address>
```
