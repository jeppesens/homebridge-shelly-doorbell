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
  CharacteristicEventTypes
} from "homebridge";
import { createServer, IncomingMessage, request, ServerResponse } from 'http';
import axios from 'axios';
import { on } from "process";

export class ShellyDoorbell implements AccessoryPlugin {

  private readonly log: Logging;

  // This property must be existent!!
  name: string;
  config: any;

  private readonly doorbellInformationService: Service; // Shows information about this accessory
  private readonly virtualDoorbellService: Service; // The HomeKit service for doorbell events
  private readonly virtualDoorbellSwitchService: Service; // A switch to turn virtual doorbell ringing on and off
  private readonly physicalDoorbellSwitchService: Service; // A switch to turn the physical door gong on and off

  private readonly physicalDoorbellShelly1SettingsURL = '/settings/relay/0';
  private virtualDoorbellActive = true;

  constructor(hap: HAP, log: Logging, config: any) {
    this.log = log;
    this.name = config.name;
    this.config = config;

    /*
     *
     * PHYICAL DOORBELL SWITCH
     * 
     */
    this.physicalDoorbellSwitchService = new hap.Service.Switch("Phsysischer Gong", "physicalDoorbellSwitch");
    this.physicalDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {

        let physicalDoorbellActive = await this.isPhysicalDoorbellActive();
        log.info("Current state of physical doorbell was requested: " + (physicalDoorbellActive ? "ON" : "OFF"));
        callback(undefined, physicalDoorbellActive);

      })
      .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {

        var newPhysicalDoorbellStatusActive = active as boolean;
        var newPhysicalDoorbellStatusSuccess = false;

        try {
          newPhysicalDoorbellStatusSuccess = await this.setPhysicalDoorbellActive(newPhysicalDoorbellStatusActive);
        } catch (error) {
          callback(error);
        }

        if (newPhysicalDoorbellStatusSuccess == false) {
          log.info("Couldn't " + (newPhysicalDoorbellStatusActive ? 'activate' : 'deactivate') + " physical doorbell.");
          return;
        }

        log.info("Physical doorbell state was set to: " + (newPhysicalDoorbellStatusActive ? "ON" : "OFF"));
        callback(null);

      });

    /*
     *
     * VIRTAUL DOORBELL SWITCH
     * 
     */
    this.virtualDoorbellSwitchService = new hap.Service.Switch("Virtueller Gong", "virtualDoorbellSwitch");
    this.virtualDoorbellSwitchService.getCharacteristic(hap.Characteristic.On)
      .on(CharacteristicEventTypes.GET, async (callback: CharacteristicGetCallback) => {

        log.info("Current state of virtual doorbell was requested: " + (this.virtualDoorbellActive ? "ON" : "OFF"));
        callback(undefined, this.virtualDoorbellActive);

      })
      .on(CharacteristicEventTypes.SET, async (active: CharacteristicValue, callback: CharacteristicSetCallback) => {

        this.virtualDoorbellActive = active as boolean;
        log.info("Virtual doorbell state was set to: " + (this.virtualDoorbellActive ? "ON" : "OFF"));
        callback(null);

      });

    this.virtualDoorbellService = new hap.Service.Doorbell(config.name);

    // create a webserver that can trigger virtual doorbell rings
    createServer(async (request: IncomingMessage, response: ServerResponse) => {

      if (this.virtualDoorbellActive == false) {
        log.info("Somebody rang the (virtual) doorbell, but this was ignored because it's muted!");
        response.end('Virtual doorbell was ignored because it is muted.');
        return;
      }

      // tell homekit to ring the bell
      this.virtualDoorbellService.getCharacteristic(hap.Characteristic.ProgrammableSwitchEvent).updateValue(0);
      response.end('Doorbell rang!');

    }).listen(this.config.virtualDoorbellWebhookPort, () => {
      log.info(`Virtual doorbell webhook http server listening on port ${this.config.virtualDoorbellWebhookPort}`);
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
    this.physicalDoorbellSwitchService.addLinkedService(this.virtualDoorbellService);

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
      this.virtualDoorbellService,
      this.virtualDoorbellSwitchService,
      this.physicalDoorbellSwitchService,
    ];
  }

  /*
   * This method can activate and deactivate the physical gong connected to a Shelly 1 relay by
   * setting the Button Type to "Activation Switch" (activated) or "Detached Switch" (deactivated).
   */
  setPhysicalDoorbellActive = async (active:boolean): Promise<boolean> => {
    return await axios.get('http://'+this.config.physicalDoorbellShelly1IP+this.physicalDoorbellShelly1SettingsURL+'?btn_type=' + (active ? 'action' : 'detached')).then((response) => {
      return response.data.btn_type == (active ? 'action' : 'detached');
    });
  }

  /*
   * This method asks the Shelly 1 device if its Button Type is set to Detached Switch
   * because then it doesn't activates it's relay and the physical gong will not be triggered.
   */
  isPhysicalDoorbellActive = async (): Promise<boolean> => {
    return await axios.get('http://'+this.config.physicalDoorbellShelly1IP+this.physicalDoorbellShelly1SettingsURL).then((response) => {
      return response.data.btn_type != 'detached';
    });
  }

}
