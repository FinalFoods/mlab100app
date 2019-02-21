/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 * @flow
 * @lint-ignore-every XPLATJSCOPYRIGHT1
 */

import React, {Component} from 'react';

import {
  AppRegistry,
  StyleSheet,
  Text,
  View,
  TouchableHighlight,
  NativeAppEventEmitter,
  NativeEventEmitter,
  NativeModules,
  Platform,
  PermissionsAndroid,
  ListView,
  ScrollView,
  AppState,
  Dimensions,
} from 'react-native';

import BleManager from 'react-native-ble-manager';
import { base64toHEX, toByteArray, pack } from './utils';

import ScanButton from './components/ScanButton';

const window = Dimensions.get('window');
// datasource used for rendering
const ds = new ListView.DataSource({rowHasChanged: (r1, r2) => r1 !== r2});

const BleManagerModule = NativeModules.BleManager;
const bleManagerEmitter = new NativeEventEmitter(BleManagerModule);

export default class App extends Component {
  constructor(){
    super()

    this.state = {
      scanning:false,
      peripherals: new Map(),
      appState: ''
    }

    // shortcuts for binding the object to the callback context
//    this.handleDiscoverPeripheral = this.handleDiscoverPeripheral.bind(this);
//    this.handleStopScan = this.handleStopScan.bind(this);
//    this.handleUpdateValueForCharacteristic = this.handleUpdateValueForCharacteristic.bind(this);
//    this.handleDisconnectedPeripheral = this.handleDisconnectedPeripheral.bind(this);
//    this.handleAppStateChange = this.handleAppStateChange.bind(this);
  }

  componentDidMount() {
    // catch 'change' events to the React.AppState object to detect an application switching to the foreground
    AppState.addEventListener('change', this.handleAppStateChange);
    // BLE interface init
    BleManager.start({showAlert: false});
    // register BLE events to be captured by the application
    this.handlerDiscover = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDiscoverPeripheral );
    this.handlerStop = bleManagerEmitter.addListener('BleManagerStopScan', this.handleStopScan );
    this.handlerDisconnect = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnectedPeripheral );
    this.handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', this.handleUpdateValueForCharacteristic );
    // deal with Android permission
    if (Platform.OS === 'android' && Platform.Version >= 23) {
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
            if (result) {
              console.log("Permission is OK");
            } else {
              PermissionsAndroid.requestPermission(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
                if (result) {
                  console.log("User accept");
                } else {
                  console.log("User refuse");
                }
              });
            }
      });
    }
  } // componentDidMount

  // Reac.AppState change event handler
  handleAppStateChange = (nextAppState) => {
    if (this.state.appState.match(/inactive|background/) && nextAppState === 'active') {
      console.log('App has come to the foreground!')
      // fetch and display on the console connected devices
      BleManager.getConnectedPeripherals([]).then((peripheralsArray) => {
        console.log('Connected peripherals: ' + peripheralsArray.length);
      });
      // TODO: any additional needed housekeeping
    }
    // set the new state (and render when appropriate)
    this.setState({appState: nextAppState});
  }

  componentWillUnmount() {
    // remove the event handlers to avoid memory leaks
    this.handlerDiscover.remove();
    this.handlerStop.remove();
    this.handlerDisconnect.remove();
    this.handlerUpdate.remove();
    this.handleAppStateChange.remove(); // MEG
  }

  // BleManagerDisconnectPeripheral event handler
  handleDisconnectedPeripheral = (data) => {
    let peripherals = this.state.peripherals;
    let peripheral = peripherals.get(data.peripheral);
    if (peripheral) {
      peripheral.connected = false;
      peripherals.set(peripheral.id, peripheral);
      this.setState({peripherals});
    }
    console.log('Disconnected from ' + data.peripheral);
  }

  // BleManagerDidUpdateValueForCharacteristic event handler
  handleUpdateValueForCharacteristic = (data) => {
    console.log('Received data from ' + data.peripheral + ' characteristic ' + data.characteristic, data.value);

/*    var service = 'ffff'; 
    var fromESP32Characteristic = '0000ff02-0000-1000-8000-00805f9b34fb';
    BleManager.read(this.peripheralPending, service, fromESP32Characteristic).then((data) => {
        console.log('After read fromESP32Characteristic');
        console.log(data);
    }); */
  }

  // start scanning for BLE devices
  startScan() {
    if (!this.state.scanning) {
      this.setState({peripherals: new Map()});
      BleManager.scan([], 3, true).then((results) => {
        console.log('Scanning...');
        // receiving BleManagerDiscoverPeripheral event for each device
        this.setState({scanning:true});
        // scan until receiving BleManagerStopScan event
      });
    }
  }

  // BleManagerDiscoverPeripheral event handler
  handleDiscoverPeripheral = (peripheral) => {
    var peripherals = this.state.peripherals;
    // a new device has been discovered
    if (!peripherals.has(peripheral.id)){
      console.log('Got ble peripheral', peripheral);
      // add the device to the Map
      peripherals.set(peripheral.id, peripheral);
      this.setState({ peripherals })
      // extract the manufacturer data 
      var h = base64toHEX(peripheral.advertising.manufacturerData.data);
      // TODO: filter by our manufacturer ID
      console.log(toByteArray(h));
      // [2, 1, 6,   8, 9, 77, 76, 65, 66, 49, 48, 48,   5, 255, 229, 2, 77, 76,
      // [229, 2, 77, 76] manufacturer data identifying ESP32 MLAB device
    }
  }

  // BleManagerStopScan event handler
  handleStopScan = () => {
    console.log('Scan is finished.');
    // change the state and render the result
    this.setState({ scanning: false });

    // add connected devices to the list
    console.log("Retrieve connected ...")
    this.retrieveConnected();
  }

  // scan for connected devices
  retrieveConnected(){
    BleManager.getConnectedPeripherals([]).then((results) => {
      if (results.length == 0) {
        console.log('No connected peripherals')
      }
      console.log(results);
      // update connected state in the devices map 
      var peripherals = this.state.peripherals;
      for (var i = 0; i < results.length; i++) {
        var peripheral = results[i];
        peripheral.connected = true;
        peripherals.set(peripheral.id, peripheral);
        this.setState({ peripherals });
      }
    });
  }

  // send a blueFi service command to a device
  blueFiService(peripheral) {
    if (peripheral){
      if (peripheral.connected){
        BleManager.disconnect(peripheral.id);
      }else{
        BleManager.connect(peripheral.id).then(() => {
          let peripherals = this.state.peripherals;
          let p = peripherals.get(peripheral.id);
          if (p) {
            p.connected = true;
            peripherals.set(peripheral.id, p);
            this.setState({peripherals});
          }
          console.log('Connected to ' + peripheral.id);

          setTimeout(() => {
            // test: sending a command to the GATT bluFi server
            BleManager.retrieveServices(peripheral.id).then((peripheralInfo) => {
              console.log(peripheralInfo);
              var service = 'ffff'; 
              var toESP32Characteristic = '0000ff01-0000-1000-8000-00805f9b34fb';
              var fromESP32Characteristic = '0000ff02-0000-1000-8000-00805f9b34fb';
              var wifiStatusCmd = [0x14,0x00,0x01,0x00]; 
              var getVersionCmd = [0x1C,0x00,0x10,0x00];//[0x14,0x00,0x10,0x00]; 

              this.peripheralPending = peripheral.id;
              setTimeout(() => { 
                BleManager.startNotification(peripheral.id, service, fromESP32Characteristic).then(() => {
                  console.log('Started notification on ' + peripheral.id);
                                
                  setTimeout(() => {
                    BleManager.write(peripheral.id, service, toESP32Characteristic, getVersionCmd).then(() => {
                      console.log('After write toESP32Characteristic');
                      /*
                      BleManager.read(peripheral.id, service, fromESP32Characteristic).then(() => {
                      console.log('After read fromESP32Characteristic');
                      //console.log(data);
                      });
                      */
                    });

                  }, 1500);
                }).catch((error) => {
                  console.log('Notification error', error);
                });
                
              }, 600);
            });
              
          }, 1900);
        }).catch((error) => {
          console.log('Connection error', error);
        });

      }
    }
  }

  render() {
    const list = Array.from(this.state.peripherals.values());
    const dataSource = ds.cloneWithRows(list);

    return (
      <View style={styles.appContainer}>
        <View style={styles.titleContainer}>
          <Text style={styles.title}>Microbiota Labs</Text>
        </View>

        <View style={[styles.buttonContainer, styles.buttonPadding]}>
          <ScanButton title="Scan Bluetooth" color="black" onPress={() => this.startScan() } />
        </View>

        <ScrollView style={styles.scroll}>
          {(list.length == 0) &&
            <View style={{flex:1, margin: 20}}>
              <Text style={{textAlign: 'center'}}>No peripherals</Text>
            </View>
          }
          <ListView
            enableEmptySections={true}
            dataSource={dataSource}
            renderRow={(item) => {
              const color = item.connected ? 'green' : '#fff';
              return (
                <TouchableHighlight onPress={() => this.blueFiService(item) }>
                  <View style={[styles.row, {backgroundColor: color}]}>
                    <Text style={{fontSize: 12, textAlign: 'center', color: '#333333', padding: 10}}>{item.name}</Text>
                    <Text style={{fontSize: 8, textAlign: 'center', color: '#333333', padding: 10}}>{item.id}</Text>
                  </View>
                </TouchableHighlight>
              );
            }}
          />
        </ScrollView>

      </View>
    );
  }
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
//    backgroundColor: '#FFF',
//    width: window.width,
//    height: window.height
  },
  titleContainer: {
    paddingTop: 35,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#D6D7DA'
  },
  title: {
    fontSize: 18,
    textAlign: 'center',
    fontWeight: 'bold',
  },
  buttonContainer: {
    paddingVertical: 10,
  },
  buttonPadding: {
    paddingHorizontal: 15,
  },  
  scroll: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    margin: 10,
  },
  row: {
    margin: 10
  },
});
