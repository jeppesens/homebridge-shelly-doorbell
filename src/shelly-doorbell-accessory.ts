import { timingSafeEqual } from "crypto";
import { appendFile } from "fs";
import {
  AccessoryPlugin,
  CharacteristicGetCallback,
  CharacteristicSetCallback,
  CharacteristicValue,
  HAP,
  Logging,
  Service,
  CharacteristicEventTypes,
  Int32,
  Int64
} from "homebridge";
import { createServer, IncomingMessage, request, ServerResponse } from 'http';
import axios from 'axios';
import { on } from "process";

export class ShellyDoorbell implements AccessoryPlugin {

  private readonly log: Logging;

  // This property must be existent!!
  name: string;
  shelly1IP: string;
  digitalDoorbellWebhookPort: Int64;
  mechanicalDoorbellName: string;
  digitalDoorbellName: string;

  private readonly doorbellInformationService: Service; // Shows information about this accessory
  private readonly digitalDoorbellService: Service; // The HomeKit service for doorbell events
  private readonly digitalDoorbellSwitchService: Service; // A switch to turn digital doorbell ringing on and off
  private readonly mechanicalDoorbellSwitchService: Service; // A switch to turn the mechanical door gong on and off

  private readonly shelly1SettingsURL = '/settings/relay/0';
  private digitalDoorbellActive = true;

  constructor(hap: HAP, log: Logging, config: any) {
    this.log = log;
    this.name = config.name || "Doorbell";
    this.shelly1IP = config.shelly1IP; //required
    this.digitalDoorbellWebhookPort = config.digitalDoorbellWebhookPort; // required
    this.mechanicalDoorbellName = config.mechanicalDoorbellName || "Mechanical gong";
    this.digitalDoorbellName = config.digitalDoorbellName || "Digital gong";

    /*
     *
     * MECHANICAL DOORBELL SWITCH
     * 
     */
    this.mechanicalDoorbellSwitchService = new hap.Service.Switch(this.mechanicalDoorbellName, "mechanicalDoorbellSwitch");
    this.mechanicalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        let mechanicalDoorbellActive = await this.isMechanicalDoorbellActive();
        callback(undefined, mechanicalDoorbellActive);
      })
      .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {

        var newMechanicalDoorbellStatusActive = active as boolean;
        var newMechanicalDoorbellStatusSuccess = false;

        try {
          newMechanicalDoorbellStatusSuccess = await this.setMechanicalDoorbellActive(newMechanicalDoorbellStatusActive);
        } catch (error) {
          callback(error);
        }

        if (newMechanicalDoorbellStatusSuccess == false) {
          log.info("Couldn't " + (newMechanicalDoorbellStatusActive ? 'activate' : 'deactivate') + " mechanical doorbell.");
          return;
        }

        log.info("Mechanical doorbell state was set to: " + (newMechanicalDoorbellStatusActive ? "ON" : "OFF"));
        callback(null);

      });

    /*
     *
     * VIRTAUL DOORBELL SWITCH
     * 
     */
    this.digitalDoorbellSwitchService = new hap.Service.Switch(this.digitalDoorbellName, "digitalDoorbellSwitch");
    this.digitalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {
        callback(undefined, this.digitalDoorbellActive);
      })
      .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {

        this.digitalDoorbellActive = active as boolean;
        log.info("Digital doorbell state was set to: " + (this.digitalDoorbellActive ? "ON" : "OFF"));
        callback(null);

      });

    this.digitalDoorbellService = new hap.Service.Doorbell(config.name);

    // create a webserver that can trigger digital doorbell rings
    createServer(async (request: IncomingMessage, response: ServerResponse) => {

      if (this.digitalDoorbellActive == false) {
        log.info("Somebody rang the (digital) doorbell, but this was ignored because it's muted!");
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
      .setCharacteristic(hap.Characteristic.Manufacturer, "sl1nd")
      .setCharacteristic(hap.Characteristic.Model, "Shelly Doorbell");

    
    // link services
    this.mechanicalDoorbellSwitchService.addLinkedService(this.digitalDoorbellService);

    log.info("Doorbell '%s' created!", config.name);
  }

  /*
   * This method is optional to implement. It is called when HomeKit ask to identify the accessory.
   * Typical this only ever happens at the pairing process.
   */
  identify(): void {
    this.log("Identify!");
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
    ];
  }

  /*
   * This method can activate and deactivate the mechanical gong connected to a Shelly 1 relay by
   * setting the Button Type to "Activation Switch" (activated) or "Detached Switch" (deactivated).
   */
  setMechanicalDoorbellActive = async (active:boolean): Promise<boolean> => {
    return await axios.get('http://'+this.shelly1IP+this.shelly1SettingsURL+'?btn_type=' + (active ? 'action' : 'detached')).then((response) => {
      return response.data.btn_type == (active ? 'action' : 'detached');
    });
  }

  /*
   * This method asks the Shelly 1 device if its Button Type is set to Detached Switch
   * because then it doesn't activates it's relay and the mechanical gong will not be triggered.
   */
  isMechanicalDoorbellActive = async (): Promise<boolean> => {
    return await axios.get('http://'+this.shelly1IP+this.shelly1SettingsURL).then((response) => {
      return response.data.btn_type != 'detached';
    });
  }

}
