"""Serial-Antworten des D7 (Firmware 4.5.3, aufgenommen beim Spot-Reinigen) in Telemetrie umsetzen."""
from __future__ import annotations

from vacuula_server.esp import poller

ANALOG = "\r\n".join([
    "GetAnalogSensors", "SensorName,Unit,Value",
    "BatteryVoltage,mV,16277,", "BatteryCurrent,mA,-1565,", "BatteryTemperature,mC,22600,", "ExternalVoltage,mV,0,",
    "AccelerometerX,mG,-28,", "CompassmeterX,mG,0,", "GyroscopeX,dps,508,",
    "VacuumCurrent,mA,611,", "SideBrushCurrent,mA,85,", "MagSensorLeft,VAL,0,",
    "WallSensor,mm,255,", "DropSensorLeft,mm,17,", "DropSensorRight,mm,23,", "",
])

MOTORS = "\r\n".join([
    "GetMotors", "Parameter,Value",
    "Brush_RPM,1168", "Brush_mA,479", "Vacuum_RPM,7800", "Vacuum_mA,624",
    "LeftWheel_RPM,1800", "LeftWheel_Load%,23", "LeftWheel_PositionInMM,445", "LeftWheel_Speed,102",
    "LeftWheel_direction,0", "RightWheel_RPM,2400", "RightWheel_Load%,47", "RightWheel_PositionInMM,83",
    "RightWheel_Speed,136", "RightWheel_direction,0", "ROTATION_SPEED,5.00", "SideBrush_mA,87", "",
])

ACCEL = "\r\n".join([
    "GetAccel", "Label,Value",
    "PitchInDegrees, -0.06", "RollInDegrees, -0.59", "XInG, 0.001", "YInG,-0.011", "ZInG, 1.029", "SumInG, 1.029",
    "", "XInDPS,  0.20", "YInDPS,  0.20", "ZInDPS,  0.44", "",
])


def test_parse_analog_keeps_old_keys_and_adds_sensors():
    assert poller.parse_analog(ANALOG) == {
        "batteryVoltageV": 16.277, "batteryCurrentMA": -1565, "batteryTemperatureC": 22.6, "externalVoltageV": 0,
        "vacuumMA": 611, "sideBrushMA": 85, "wallMM": 255, "dropLeftMM": 17, "dropRightMM": 23,
    }


def test_parse_motors_reads_vacuum_current_and_lidar_speed():
    m = poller.parse_motors(MOTORS)
    assert m is not None
    assert m["vacuumMA"] == 624
    assert m["laserRPM"] == 300
    assert m["leftWheelLoad"] == 23 and m["rightWheelPositionMM"] == 83 and m["sideBrushMA"] == 87
    assert "LeftWheel_direction" not in m


def test_parse_accel():
    assert poller.parse_accel(ACCEL) == {
        "pitchDeg": -0.06, "rollDeg": -0.59, "sumG": 1.029, "gyroXDps": 0.2, "gyroYDps": 0.2, "gyroZDps": 0.44,
    }


def test_parse_errors_give_none():
    assert poller.parse_analog("GetAnalogSensors\r\nUnknown Cmd") is None
    assert poller.parse_motors("GetMotors\r\n") is None
    assert poller.parse_accel("") is None
