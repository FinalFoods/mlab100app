import BleManager from 'react-native-ble-manager';

export default class blueFiService {
  constructor(bleManagerEmitter) {
    this.bleManagerEmitter = bleManagerEmitter;
    bleManagerEmitter.addListener('BleManagerConnectPeripheral', this.handleDeviceConnect);
 
    this.devices = new Map();
    this.service = 'ffff'; 
    this.toESP32Characteristic = '0000ff01-0000-1000-8000-00805f9b34fb';
    this.fromESP32Characteristic = '0000ff02-0000-1000-8000-00805f9b34fb';
    //this.wifiStatusCmd = [0x14,0x00,0x01,0x00]; 
  }

  // BleManagerConnectPeripheral event handler
  handleDeviceConnect = (data) => {
    let id = data.peripheral;
    console.log("blueFi: device", data.peripheral, 'is connected');

    // we assume only MLab devices can connect to the app
    if (!this.devices.has(id)){
      // add the device to the devices map
      this.devices.set(id, {id: id, seqNum: 0, pending: false});
    }
  }

  // BleManagerDisconnectPeripheral event handler
  handleDeviceDisconnect = (data) => {
    let id = data.peripheral;
    console.log("blueFi: device", data.peripheral, 'is disconnected');

    // remove the device from the devices map
    if (this.devices.has(id)) {
      this.devices.delete(id);
    }
  }

  // get blueFi version
  getVersion = async (id) => {
    let device = this.devices.get(id);
    let cmd = [0x1C,0x00,device.seqNum,0x00];
    console.log('blueFi: getVersion', cmd);

    device.seqNum += 1;     // increment seq number for the device
    device.pending = true;  // set pending state
    this.devices.set(id, device);
    let that = this;

    var promise = new Promise(function(resolve, reject) {
      let handler = that.bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', function ev(data) {
        let id = data.peripheral;
        let device = that.devices.get(id);

        console.log('blueFi: received data from ', id, data.value);
        device.pending = false;   // reset command pending state
        that.devices.set(id, device);

        handler.remove();   // remove the event handler
        // the blueFi server is returning an array of 6 elements ex. [65, 4, 0, 2, 1, 2] 
        resolve(data.value[4].toString() + '.' + data.value[5].toString());
      });
    });

    let peripheralInfo = await BleManager.retrieveServices(id);
    // console.log(peripheralInfo);
    await BleManager.startNotification(id, this.service, this.fromESP32Characteristic);
    await BleManager.write(id, this.service, this.toESP32Characteristic, cmd);

    return promise;
  } // getVersion

}
