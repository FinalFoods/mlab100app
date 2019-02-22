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
import { base64toHEX, toByteArray, pack } from './utils/BufferHelpers';
import blueFiService from './utils/blueFiService'

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

    // BLE interface init
    BleManager.start({showAlert: false});

    this.blueFi = new blueFiService(bleManagerEmitter);
  }

  componentDidMount() {
    // catch 'change' events to the React.AppState object to detect an application switching to the foreground
    AppState.addEventListener('change', this.handleAppStateChange);

    // register BLE events to be captured by the application
    this.handlerDiscover = bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', this.handleDiscoverPeripheral );
    this.handlerStop = bleManagerEmitter.addListener('BleManagerStopScan', this.handleStopScan );
    this.handlerDisconnect = bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', this.handleDisconnectedPeripheral );

//    this.handlerUpdate = bleManagerEmitter.addListener('BleManagerDidUpdateValueForCharacteristic', this.handleUpdateValueForCharacteristic );

    // deal with Android permission
    if (Platform.OS === 'android' && Platform.Version >= 23) {
        PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
            if (result) {
              console.log("Permissions OK.");
            } else {
              PermissionsAndroid.requestPermission(PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION).then((result) => {
                if (result) {
                  console.log("User accepted.");
                } else {
                  console.log("User refused.");
                }
              });
            }
      });
    }
  } // componentDidMount

  // Reac.AppState change event handler
  handleAppStateChange = (newAppState) => {
    if (this.state.appState.match(/inactive|background/) && newAppState === 'active') {
      console.log('App has switched to foreground.')
      // fetch and display on the console connected devices
      BleManager.getConnectedPeripherals([]).then((peripheralsArray) => {
        console.log('Connected peripherals: ' + peripheralsArray.length);
      });
      // TODO: any additional needed housekeeping
    }
    // set the new state (and render when appropriate)
    this.setState({appState: newAppState});
  }

  componentWillUnmount() {
    // remove the event handlers to avoid memory leaks
    this.handlerDiscover.remove();
    this.handlerStop.remove();
    this.handlerDisconnect.remove();
    this.handlerUpdate.remove();
    // remove the change state listener to avoid multiple handlers when app switches to foreground
    AppState.removeEventListener('change', this.handleAppStateChange);
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

    // only one callback may be registered in BLE native module
    this.blueFi.handleDeviceDisconnect(data);  // propagate the event to the blueFi object
  }

/*
  // BleManagerDidUpdateValueForCharacteristic event handler
  handleUpdateValueForCharacteristic = (data) => {
    console.log('Received data from ' + data.peripheral + ' characteristic ' + data.characteristic, data.value);
  }
*/

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
  connectDevice(peripheral) {
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

          // get the blueFi server version number
          this.blueFi.getVersion(peripheral.id).then((res) => {
            console.log("getVersion:", res);
          });

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
                <TouchableHighlight onPress={() => this.connectDevice(item) }>
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
