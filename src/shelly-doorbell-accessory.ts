import { AccessoryPlugin, API, HAP, Logging, Service } from 'homebridge';
import { createServer, IncomingMessage, ServerResponse } from 'http';
import axios, { AxiosRequestConfig } from 'axios';
import NodePersist, { LocalStorage } from 'node-persist';

export class ShellyDoorbell implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly api: API;

  // This property must be existent!!
  name: string;
  shelly1IP: string;
  digitalDoorbellWebhookPort: number;
  mechanicalDoorbellName: string;
  digitalDoorbellName: string;
  doorbellRang = false;

  private readonly doorbellInformationService: Service; // Shows information about this accessory
  private readonly digitalDoorbellService: Service; // The HomeKit service for doorbell events
  private readonly digitalDoorbellSwitchService: Service; // A switch to turn digital doorbell ringing on and off
  private readonly mechanicalDoorbellSwitchService: Service; // A switch to turn the mechanical door gong on and off
  private readonly motionSensorService: Service; // The HomeKit service for doorbell events

  private readonly shelly1SettingsURL = '/settings/relay/0';
  private axios_args: AxiosRequestConfig = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(api: API, hap: HAP, log: Logging, config: any) {
    this.log = log;
    this.api = api;
    this.name = config.name || 'Doorbell';
    this.shelly1IP = config.shelly1IP; //required
    if (config.shelly1Username) {
      this.axios_args.auth = {
        username: config.shelly1Username,
        password: config.shelly1Password,
      };
    }
    this.digitalDoorbellWebhookPort = config.digitalDoorbellWebhookPort; // required
    this.mechanicalDoorbellName = config.mechanicalDoorbellName || 'Mechanical gong';
    this.digitalDoorbellName = config.digitalDoorbellName || 'Digital gong';

    /*
     *
     * MECHANICAL DOORBELL SWITCH
     *
     */
    this.mechanicalDoorbellSwitchService = new hap.Service.Switch(this.mechanicalDoorbellName, 'mechanicalDoorbellSwitch');
    this.mechanicalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.isMechanicalDoorbellActive())
      .onSet((newValue) => this.setMechanicalDoorbellActive(Boolean(newValue)));


    /*
     *
     * DIGITAL DOORBELL SWITCH
     *
     */
    this.digitalDoorbellSwitchService = new hap.Service.Switch(this.digitalDoorbellName, 'digitalDoorbellSwitch');
    this.digitalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.isDigitalDoorbellActive())
      .onSet((newValue) => this.setDigitalDoorbellActive(Boolean(newValue)));


    /*
     *
     * MOTION SENSOR
     *
     */
    this.motionSensorService = new hap.Service.MotionSensor(this.name, 'doorbellMotionSensor');
    this.motionSensorService.getCharacteristic(hap.Characteristic.MotionDetected)
      .onGet(() => this.doorbellRang);

    this.digitalDoorbellService = new hap.Service.Doorbell(this.name);

    // create a webserver that can trigger digital doorbell rings
    createServer(async (request: IncomingMessage, response: ServerResponse) => {

      this.doorbellMotionDetected();

      if (await this.isDigitalDoorbellActive() === false) {
        log.info('Somebody rang the (digital) doorbell, but this was ignored because it\'s muted!');
        response.end('Digital doorbell was ignored because it is muted.');
        return;
      }

      // tell homekit to ring the bell
      this.digitalDoorbellService.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent).updateValue(0);
      response.end('Doorbell rang!');

    }).listen(this.digitalDoorbellWebhookPort, () => {
      log.info(`Digital doorbell webhook http server listening on port ${this.digitalDoorbellWebhookPort}`);
    });

    /*
     *
     * DOORBELL ACCESSORY INFORMATION
     *
     */

    this.doorbellInformationService = new hap.Service.AccessoryInformation()
      .setCharacteristic(hap.Characteristic.Manufacturer, 'sl1nd')
      .setCharacteristic(hap.Characteristic.Model, 'Shelly Doorbell');

    // link services
    this.mechanicalDoorbellSwitchService.addLinkedService(this.digitalDoorbellSwitchService);

    log.info('Doorbell \'%s\' created!', this.name);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log('Identify!');
  }

  /*
   * This method is called directly after creation of this instance.
   * It should return all services which should be added to the accessory.
   */
  getServices(): Service[] {
    return [
      this.doorbellInformationService,
      this.digitalDoorbellService,
      this.digitalDoorbellSwitchService,
      this.mechanicalDoorbellSwitchService,
      this.motionSensorService,
    ];
  }

  /*
   * This method can activate and deactivate the mechanical gong connected to a Shelly 1 relay by
   * setting the Button Type to "Activation Switch" (activated) or "Detached Switch" (deactivated).
   */
  async setMechanicalDoorbellActive(active:boolean): Promise<boolean> {
    const url = 'http://'+this.shelly1IP+this.shelly1SettingsURL+'?btn_type=' + (active ? 'action' : 'detached');
    return axios.get(
      url,
      this.axios_args,
    ).then((response) => {
      this.log.debug('Response from Shelly: ' + JSON.stringify(response.data));
      return response.data.btn_type === (active ? 'action' : 'detached');
    }).catch((error) => {
      const msg = 'Error setting doorbell shelly button type: ' + error + ' with URL ' + url;
      this.log.error(msg);
      throw new Error(msg);
    });
  }

  /*
   * This method asks the Shelly 1 device if its Button Type is set to Detached Switch
   * because then it doesn't activates it's relay and the mechanical gong will not be triggered.
   */
  async isMechanicalDoorbellActive(): Promise<boolean> {
    const url = 'http://'+this.shelly1IP+this.shelly1SettingsURL;
    return axios.get(
      url,
      this.axios_args,
    ).then((response) => {
      this.log.debug('Response from Shelly: ' + JSON.stringify(response.data));
      return response.data.btn_type !== 'detached';
    }).catch((error) => {
      const msg = 'Error reading doorbell shelly settings type: ' + error + ' at URL ' + url;
      this.log.error(msg);
      throw new Error(msg);
    });
  }

  /*
   * The state of the digital doorbell is persisted to keep the user setting after every reboot.
   */
  private _digitalDoorbellActive: boolean | null = null;

  private async isDigitalDoorbellActive() {
    if (this._digitalDoorbellActive === null) {
      const localStorage = await this.getLocalStorage();
      let config = await localStorage.getItem(this.storageItemName);
      if (config === undefined) {
        config = { digitalDoorbellActive: true }; // default state is on
      }
      this._digitalDoorbellActive = config.digitalDoorbellActive;
    }
    return this._digitalDoorbellActive;
  }

  private async setDigitalDoorbellActive(active:boolean) {
    const localStorage = await this.getLocalStorage();
    await localStorage.setItem(this.storageItemName, { digitalDoorbellActive: active });
    this._digitalDoorbellActive = active;
    this.log.info(this.digitalDoorbellName + ' was ' + (active ? 'activated' : 'disabled') + '.');
  }

  async getLocalStorage(): Promise<LocalStorage> {
    const localStorage = NodePersist.create();
    const path = this.api.user.storagePath() + '/plugin-persist/homebridge-shelly-doorbell';
    await localStorage.init({ dir: path });
    return localStorage;
  }

  get storageItemName(): string {
    return this.name + '-' + this.shelly1IP;
  }

  /*
   * Trigger the Motion sensor and set it back after 5 seconds.
   */
  private doorbellMotionDetected() {
    this.doorbellRang = true;
    this.motionSensorService.getCharacteristic(this.api.hap.Characteristic.MotionDetected).updateValue(this.doorbellRang);
    setTimeout(() => {
      this.doorbellRang = false;
      this.motionSensorService.getCharacteristic(this.api.hap.Characteristic.MotionDetected).updateValue(this.doorbellRang);
    }, 5000);
  }
}