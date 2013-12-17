var com = require("serialport");
var mqtt = require('mqtt');

var topic, message;
var previous = [];

var opentherm_ids = {
        0: "flame_status",
        1: "control_setpoint",
        9: "remote_override_setpoint",
        16: "room_setpoint",
        24: "room_temperature",
        25: "boiler_water_temperature",
        26: "dhw_temperature",
        28: "return_water_temperature",
        116: "burner_starts",
        117: "ch_pump_starts",
        119: "dhw_burner_starts",
        120: "burner_operation_hours",
        121: "ch_pump_operation_hours",
        123: "dhw_burner_operation_hours"
};

var opentherm_ids_types = {
        0: "flag8",
        1: "f8.8",
        9: "f8.8",
        16: "f8.8",
        24: "f8.8",
        25: "f8.8",
        26: "f8.8",
        28: "f8.8",
        116: "u16",
        117: "u16",
        119: "u16",
        120: "u16",
        121: "u16",
        123: "u16"
};

client = mqtt.createClient(1883, 'mqtt.eigenhuis.lan');
client.subscribe('/control/otg/#');

var serialPort = new com.SerialPort("/dev/ttyUSB0", {
        baudrate: 9600,
        parser: com.parsers.readline('\r\n')
});

serialPort.on('open', function() {
        console.log('Serial port open');
});

client.on('message', function(topic, message) {
        switch (topic) {
                case '/control/otg/tt':
                        serialPort.write('TT=' + message + '\r\n');
                        break;

                case '/control/otg/tc':
                        serialPort.write('TC=' + message + '\r\n');
                        break;

                default:
                        console.log("fallback" + topic + message);
                        break;
        }
});

serialPort.on('data', function(data) {
        // check for OT packets
        // console.log(data);
        opentherm_target = data.slice(0, 1); // B, T, A, R, E
        opentherm_type = data.slice(1, 2); //
        opentherm_id = parseInt(data.slice(3, 5), 16); //
        opentherm_payload = data.slice(-4); // last 4 chars

        //if (opentherm_target == "B" || opentherm_target == "T" || opentherm_target == "A" || opentherm_target == "R" || opentherm_target == "E") {
        if (opentherm_target == "B" || opentherm_target == "T" || opentherm_target == "A") {
                // if (opentherm_type == "1" || opentherm_type == "4" || opentherm_type == "C" || opentherm_type == "9") {
                if (opentherm_type == "1" || opentherm_type == "4") {
                        if (opentherm_id in opentherm_ids) {
                                topic = opentherm_ids[opentherm_id];
                                switch (opentherm_ids_types[opentherm_id]) {
                                        case 'flag8':
                                                message = parseInt(opentherm_payload, 16).toString(2);
                                                break;

                                        case 'f8.8':
                                                message = (parseInt(opentherm_payload, 16) / 256).toFixed(2);
                                                break;

                                        case 'u16':
                                                message = parseInt(opentherm_payload, 16);
                                                break;
                                }

                                // console.log((previous[topic] + previous[message]));
                                // console.log((topic+message));
                                // console.log((topic + message) (previous[topic] + previous[message]));
                                if ((topic + message) != (previous[topic] + previous[message])) {
                                        client.publish('/value/otg/' + topic, String(message), {
                                                retain: true
                                        });
                                        previous[topic] = topic;
                                        previous[message] = message;
                                }
                        }
                }
        }
});
