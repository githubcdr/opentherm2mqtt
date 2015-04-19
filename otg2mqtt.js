var com = require('serialport'),
    mqtt = require('mqtt'),
    previous = [],
    topics = [],
    client,
    opentherm_ids = {
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
    },
    opentherm_ids_types = {
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

(function () {
    var convertBase = function (num) {
        this.from = function (baseFrom) {
            this.to = function (baseTo) {
                return parseInt(num, baseFrom).toString(baseTo);
            };
            return this;
        };
        return this;
    };

    // binary to decimal
    this.bin2dec = function (num) {
        return convertBase(num).from(2).to(10);
    };

    // binary to hexadecimal
    this.bin2hex = function (num) {
        return convertBase(num).from(2).to(16);
    };

    // decimal to binary
    this.dec2bin = function (num) {
        return convertBase(num).from(10).to(2);
    };

    // decimal to hexadecimal
    this.dec2hex = function (num) {
        return convertBase(num).from(10).to(16);
    };

    // hexadecimal to binary
    this.hex2bin = function (num) {
        return convertBase(num).from(16).to(2);
    };

    // hexadecimal to decimal
    this.hex2dec = function (num) {
        return convertBase(num).from(16).to(10);
    };

    return this;
})();

var serialPort = new com.SerialPort("/dev/ttyUSB0", {
    baudrate: 9600,
    parser: com.parsers.readline('\r\n')
});

//serialPort.on( 'open', function () {
// console.log( 'Serial port open' );
//} );

client = mqtt.connect('mqtt://mqtt.eigenhuis.lan', {
    will: {
        topic: '/status/otg',
        payload: 'offline',
        retain: true
    }
});
client.publish('/log/otg', 'service started');
client.publish('/status/otg', 'online', {retain: true});
client.subscribe('/control/otg/#');

client.on('message', function (topic, message) {
    switch (topic) {
        case '/control/otg/status':
            result = 'online';
            break;

        case '/control/otg/tt':
            serialPort.write('TT=' + message + '\r\n');
            result = message;
            break;

        case '/control/otg/tc':
            serialPort.write('TC=' + message + '\r\n');
            result = message;
            break;

        case '/control/otg/hw':
            result = message;
            serialPort.write('HW=' + message + '\r\n');
            break;
    }

    client.publish("/log/otg" + topic, result);
});

serialPort.on('data', function (data) {
    // check for OT packets
    opentherm_target = data.slice(0, 1); // B, T, A, R, E
    opentherm_type = data.slice(1, 2); //
    opentherm_id = parseInt(data.slice(3, 5), 16); //
    opentherm_payload = data.slice(-4); // last 4 chars

    //      console.log( data );

    if (data.length == 9) {
        //if (opentherm_target == "B" || opentherm_target == "T" || opentherm_target == "A" || opentherm_target == "R" || opentherm_target == "E") {
        if (opentherm_target == "B" || opentherm_target == "T" || opentherm_target == "A") {
            if (opentherm_type == "1" || opentherm_type == "4" || opentherm_type == "C" || opentherm_type == "9") {
                // if (opentherm_type == "1" || opentherm_type == "4" ) {
                if (opentherm_id in opentherm_ids) {
                    topic = '/value/otg/' + opentherm_ids[opentherm_id];
                    switch (opentherm_ids_types[opentherm_id]) {
                        case 'flag8':
                            if (opentherm_target != "A") {
                                topics[topic] = hex2dec(opentherm_payload);

                                if (( topics[topic] & ( 1 << 1 ) ) > 0) {
                                    topics["/value/otg/flame_status_ch"] = 1;
                                } else {
                                    topics["/value/otg/flame_status_ch"] = 0;
                                }

                                if (( topics[topic] & ( 1 << 2 ) ) > 0) {
                                    topics["/value/otg/flame_status_dhw"] = 1;
                                } else {
                                    topics["/value/otg/flame_status_dhw"] = 0;
                                }

                                if (( topics[topic] & ( 1 << 3 ) ) > 0) {
                                    topics["/value/otg/flame_status_bit"] = 1;
                                } else {
                                    topics["/value/otg/flame_status_bit"] = 0;
                                }
                            }
                            break;

                        case 'f8.8':
                            topics[topic] = ( parseInt(opentherm_payload, 16) / 256 ).toFixed(2);
                            break;

                        case 'u16':
                            topics[topic] = parseInt(opentherm_payload, 16);
                            break;
                    }

                    // check for changes that need to be published
                    for (var value in topics) {
                        if (topics[value] != previous[value]) {
                            client.publish(value, String(topics[value]), {
                                retain: true
                            });
                            previous[value] = topics[value];
                        }
                    }
                }
            }
        }
    }
});
