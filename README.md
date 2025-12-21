# ioBroker.mitsubishi-ae200

[![NPM version](https://img.shields.io/npm/v/iobroker.mitsubishi-ae200.svg)](https://www.npmjs.com/package/iobroker.mitsubishi-ae200)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Beschreibung

ioBroker Adapter zur Steuerung von Mitsubishi AE-200 HVAC-Controllern.

Der Adapter kommuniziert über WebSocket mit dem AE-200 Controller und ermöglicht die vollständige Steuerung aller angeschlossenen Klimageräte.

## Features

- **Automatische Geräteerkennung**: Alle am AE-200 angeschlossenen Geräte werden automatisch erkannt
- **Vollständige Steuerung**:
  - Ein-/Ausschalten
  - Temperaturregelung
  - Modus (Heizen, Kühlen, Entfeuchten, Lüfter, Auto)
  - Lüftergeschwindigkeit (Auto, Low, Mid2, Mid1, High)
  - Luftrichtung
- **Monitoring**:
  - Aktuelle Raumtemperatur
  - Luftfeuchtigkeit (falls vom Gerät unterstützt)
  - Filterstatus
  - Fehlerstatus

## Installation

### Über ioBroker Admin

1. Adapter über den Adapter-Tab in ioBroker installieren
2. IP-Adresse des AE-200 Controllers eingeben
3. Polling-Intervall konfigurieren (Standard: 30 Sekunden)

### Manuelle Installation (Entwicklung)

```bash
cd /opt/iobroker
npm install /pfad/zu/iobroker.mitsubishi-ae200
iobroker add mitsubishi-ae200
```

## Konfiguration

| Parameter | Beschreibung | Standard |
|-----------|--------------|----------|
| IP-Adresse | IP-Adresse des AE-200 Controllers | - |
| Polling-Intervall | Abfrageintervall in Sekunden | 30 |

## Datenpunkte

Für jedes erkannte Gerät werden folgende Datenpunkte erstellt:

```
mitsubishi-ae200.0.
├── info.connection          (boolean) - Verbindungsstatus
└── devices.
    └── {deviceId}.
        ├── name             (string)  - Gerätename
        ├── power            (boolean) - Ein/Aus [R/W]
        ├── mode             (string)  - Modus [R/W]
        ├── targetTemperature (number) - Solltemperatur [R/W]
        ├── currentTemperature (number) - Isttemperatur [R]
        ├── fanSpeed         (string)  - Lüftergeschwindigkeit [R/W]
        ├── humidity         (number)  - Luftfeuchtigkeit [R]
        ├── filterSign       (boolean) - Filterwechsel nötig [R]
        ├── errorSign        (boolean) - Fehler vorhanden [R]
        └── airDirection     (string)  - Luftrichtung [R/W]
```

### Modi

| Wert | Beschreibung |
|------|--------------|
| HEAT | Heizen |
| COOL | Kühlen |
| DRY | Entfeuchten |
| FAN | Nur Lüfter |
| AUTO | Automatik |

### Lüftergeschwindigkeiten

| Wert | Beschreibung |
|------|--------------|
| AUTO | Automatik |
| LOW | Niedrig |
| MID2 | Mittel-Niedrig |
| MID1 | Mittel-Hoch |
| HIGH | Hoch |

## Beispiel: Verwendung mit JavaScript

```javascript
// Klimaanlage einschalten
setState('mitsubishi-ae200.0.devices.1.power', true);

// Temperatur auf 22°C setzen
setState('mitsubishi-ae200.0.devices.1.targetTemperature', 22);

// Modus auf Kühlen setzen
setState('mitsubishi-ae200.0.devices.1.mode', 'COOL');

// Aktuelle Temperatur lesen
const temp = getState('mitsubishi-ae200.0.devices.1.currentTemperature').val;
console.log(`Aktuelle Temperatur: ${temp}°C`);
```

## Beispiel: Verwendung mit Blockly/Node-RED

Die Datenpunkte können wie gewohnt in Blockly oder Node-RED verwendet werden.

## Entwicklung

```bash
# Abhängigkeiten installieren
npm install

# TypeScript kompilieren
npm run build

# TypeScript im Watch-Modus
npm run watch
```

## Changelog

### 1.0.0
- Erstveröffentlichung
- Grundlegende Steuerung und Monitoring

## Lizenz

MIT License - siehe [LICENSE](LICENSE)

## Credits

Basierend auf der Home Assistant Integration von [@natevoci](https://github.com/natevoci/ha-ae200/).
