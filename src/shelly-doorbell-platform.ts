import { AccessoryPlugin, API, HAP, Logging, PlatformConfig, StaticPlatformPlugin } from 'homebridge';
import { Config } from './Config';
import { ShellyDoorbell } from './shelly-doorbell-accessory';
const PLATFORM_NAME = 'ShellyDoorbell';

/*
 * IMPORTANT NOTICE
 *
 * One thing you need to take care of is, that you never ever ever import anything directly from the "homebridge" module (or the
 * "hap-nodejs" module).
 * The above import block may seem like, that we do exactly that, but actually those imports are only used for types and interfaces
 * and will disappear once the code is compiled to Javascript.
 * In fact you can check that by running `npm run build` and opening the compiled Javascript file in the `dist` folder.
 * You will notice that the file does not contain a `... = require("homebridge");` statement anywhere in the code.
 *
 * The contents of the above import statement MUST ONLY be used for type annotation or accessing things like CONST ENUMS,
 * which is a special case as they get replaced by the actual value and do not remain as a reference in the compiled code.
 * Meaning normal enums are bad, const enums can be used.
 *
 * You MUST NOT import anything else which remains as a reference in the code, as this will result in
 * a `... = require("homebridge");` to be compiled into the final Javascript code.
 * This typically leads to unexpected behavior at runtime, as in many cases it won't be able to find the module
 * or will import another instance of homebridge causing collisions.
 *
 * To mitigate this the {@link API | Homebridge API} exposes the whole suite of HAP-NodeJS inside the `hap` property
 * of the api object, which can be acquired for example in the initializer function. This reference can be stored
 * like this for example and used to access all exported variables and classes from HAP-NodeJS.
 */
let hap: HAP;

export = (api: API) => {
  hap = api.hap;

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  api.registerPlatform(PLATFORM_NAME, ShellyDoorbellPlatform as any);
};

type DoorbellsConfig = PlatformConfig & {
  doorbells: Config[];
  homebridgeIp: string;
};

class ShellyDoorbellPlatform implements StaticPlatformPlugin {

  private readonly api: API;
  private readonly log: Logging;

  private readonly config: DoorbellsConfig;
  private readonly shelly1DeviceInfoURL = '/status';

  constructor(log: Logging, config: DoorbellsConfig, api: API) {
    this.api = api;
    this.log = log;
    this.config = config;

    // probably parse config or something here
    log.info('Shelly doorbell platform finished initializing!');
  }

  /*
   * This method is called to retrieve all accessories exposed by the platform.
   * The Platform can delay the response my invoking the callback at a later time,
   * it will delay the bridge startup though, so keep it to a minimum.
   * The set of exposed accessories CANNOT change over the lifetime of the plugin!
   */
  async accessories(callback: (foundAccessories: AccessoryPlugin[]) => void): Promise<void> {
    const shellyDoorbells:ShellyDoorbell[] = [];

    await Promise.all(this.config.doorbells.map(async (doorbellConfig, doorbellIndex) => {
      shellyDoorbells[doorbellIndex] = new ShellyDoorbell(
        this.api, hap, this.log, {...doorbellConfig, homebridgeIp: this.config.homebridgeIp},
      );
    }));

    callback(shellyDoorbells);
  }
}
