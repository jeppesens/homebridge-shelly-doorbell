import axios, { AxiosRequestConfig } from 'axios';
import { API, AccessoryPlugin, HAP, Logging, Service } from 'homebridge';
import { IncomingMessage, ServerResponse, createServer } from 'http';
import NodePersist, { LocalStorage } from 'node-persist';
import { Config } from './Config';

export class ShellyDoorbell implements AccessoryPlugin {

  private readonly log: Logging;
  private readonly api: API;

  // This property must be existent!!
  name: string;
  shellyIP: string;
  digitalDoorbellWebhookPort: number;
  mechanicalDoorbellName: string;
  doorbellRang = false;
  homebridgeIp: string;

  private readonly doorbellInformationService: Service; // Shows information about this accessory
  private readonly digitalDoorbellService: Service; // The HomeKit service for doorbell events
  private readonly mechanicalDoorbellSwitchService: Service; // A switch to turn the mechanical door gong on and off

  private get shellyUrl() {
    return 'http://' + this.shellyIP + '/rpc';
  }

  private readonly hookName = 'Homebridge Doorbell';

  private axios_args: AxiosRequestConfig = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(api: API, hap: HAP, log: Logging, config: Config) {
    this.log = log;
    this.api = api;
    this.name = config.name || 'Doorbell';
    this.shellyIP = config.shellyIP; //required
    this.homebridgeIp = config.homebridgeIp;
    if (config.shellyUsername && config.shellyPassword) {
      this.axios_args.auth = {
        username: config.shellyUsername,
        password: config.shellyPassword,
      };
    } else {
      this.log.info('No username and password provided for Shelly device');
    }
    this.digitalDoorbellWebhookPort = config.digitalDoorbellWebhookPort; // required
    this.mechanicalDoorbellName = config.mechanicalDoorbellName || 'Mechanical gong';

    /*
     *
     * MECHANICAL DOORBELL SWITCH
     *
     */
    this.mechanicalDoorbellSwitchService = new hap.Service.Switch(this.mechanicalDoorbellName, 'mechanicalDoorbellSwitch');
    this.mechanicalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .onGet(() => this.isMechanicalDoorbellActive())
      .onSet((newValue) => this.setMechanicalDoorbellActive(Boolean(newValue)));

    this.digitalDoorbellService = new hap.Service.Doorbell(this.name);

    // create a webserver that can trigger digital doorbell rings
    createServer(async (request: IncomingMessage, response: ServerResponse) => {
      // tell Homekit to ring the bell
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
      .setCharacteristic(hap.Characteristic.Manufacturer, 'Shelly')
      .setCharacteristic(hap.Characteristic.SerialNumber, this.shellyIP)
      .setCharacteristic(hap.Characteristic.Model, 'Shelly Doorbell');

    this.setup();

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
      this.mechanicalDoorbellSwitchService,
    ];
  }

  async setup(): Promise<boolean> {
    // https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Input#configuration
    const inputConfig = {
      'id':1,
      'method':'Input.SetConfig',
      'params':{'id':0, 'config':{'type':'button'}},
    };
    await axios.post(this.shellyUrl, inputConfig).then((response) => {
      this.log.debug('Input.SetConfig', JSON.stringify(response.data));
      return response;
    });
    const isActive = await this.isMechanicalDoorbellActive();
    await this.setMechanicalDoorbell(isActive);
    return true;
  }

  async setMechanicalDoorbell(active: boolean): Promise<true> {
    const webhooks = await axios.get<{
      hooks: Array<{
        id: number;
        cid: number;
        enable: boolean;
        event:string;
        name:string;
        urls: Array<string>;
        condition: unknown;
        repeat_period: number;
      }>;
    }>(
      this.shellyUrl+'/Webhook.List',
      this.axios_args,
    ).then((response) => {
      this.log.debug('Webhook.List: ', JSON.stringify(response.data));
      return response;
    });

    const existingHook = webhooks.data.hooks?.find((hook) => hook.name === this.hookName);
    if (existingHook) {
      this.log.debug('Webhook to update: ', JSON.stringify(existingHook));
    } else {
      this.log.debug('No Webhook found to update');
    }

    const webhookPayload = {
      'id': 1,
      'method': existingHook ? 'Webhook.Update' : 'Webhook.Create',
      'params':{
        'id': existingHook?.id || 0,
        'enable': true,
        'event':'input.button_push',
        'urls':[`http://${this.homebridgeIp}:${this.digitalDoorbellWebhookPort}`],
        'name':this.hookName,
      },
    };
    // https://shelly-api-docs.shelly.cloud/gen2/ComponentsAndServices/Webhook
    await axios.post(
      this.shellyUrl,
      webhookPayload,
      this.axios_args,
    ).then((response) => {
      this.log.debug(`${JSON.stringify(webhookPayload)} : ` + JSON.stringify(response.data));
      return response;
    });

    const switchConfig = {
      'id': 1,
      'method': 'Switch.SetConfig',
      'params': {
        'id': 0,
        'config': {
          'name': null,
          'in_mode': active ? 'momentary' : 'detached',
          'initial_state': 'off',
          'auto_on': false,
          'auto_off': true,
          'auto_off_delay': 0.20,
        },
      },
    };
    await axios.post(
      this.shellyUrl,
      switchConfig,
      this.axios_args,
    ).then((response) => {
      this.log.debug(`${switchConfig} : ` + JSON.stringify(response.data));
      return response;
    });
    return true;
  }

  /*
   * This method can activate and deactivate the mechanical gong connected to a Shelly 1 relay by
   * setting the Button Type to "Activation Switch" (activated) or "Detached Switch" (deactivated).
   */
  async setMechanicalDoorbellActive(active: boolean): Promise<true> {
    try {
      await this.setMechanicalDoorbell(active);
      return true;
    } catch (error) {
      const msg = 'Error setting doorbell shelly button type: ' + error + ' with URL ' + this.shellyUrl;
      this.log.error(msg);
      throw new Error(msg);
    }
  }

  /*
   * This method asks the Shelly 1 device if its Button Type is set to Detached Switch
   * because then it doesn't activates it's relay and the mechanical gong will not be triggered.
   */
  async isMechanicalDoorbellActive(): Promise<boolean> {
    const url = this.shellyUrl+'/Switch.GetConfig?id=0';
    return axios.get<{
      'id': 0;
      'name': string;
      'in_mode': string;
      'initial_state': string;
      'auto_on': boolean;
      'auto_on_delay': number;
      'auto_off': boolean;
      'auto_off_delay': number;
      'autorecover_voltage_errors': boolean;
      'power_limit': number;
      'voltage_limit': number;
      'undervoltage_limit': number;
      'current_limit': number;
    }>(
      url,
      this.axios_args,
    ).then((response) => {
      this.log.debug('GET /Switch.GetConfig?id=0 : ' + JSON.stringify(response.data));
      return response.data.in_mode !== 'detached';
    }).catch((error) => {
      const msg = 'Error reading doorbell shelly settings type: ' + error + ' at URL ' + url;
      this.log.error(msg);
      throw new Error(msg);
    });
  }

  async getLocalStorage(): Promise<LocalStorage> {
    const localStorage = NodePersist.create();
    const path = this.api.user.storagePath() + '/plugin-persist/homebridge-shelly-doorbell';
    await localStorage.init({ dir: path });
    return localStorage;
  }

  get storageItemName(): string {
    return this.name + '-' + this.shellyIP;
  }
}