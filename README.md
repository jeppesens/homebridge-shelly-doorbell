# Homebridge Shelly Doorbell Plugin

This Homebridge plugin, together with a [Shelly 1 Plus](https://www.shelly.cloud/en/products/shop/shelly-plus-1), can turn any old-fashioned two-wire doorbell into a HomeKit-compatible digital doorbell.

![alt text](img/push.png "HomeKit doorbell Push Notification example")

That means you can get a push notification when someone rings your doorbell and it doesn't matter if you are at home or on the road. You can also turn your doorbell on and off via HomeKit. This enables you to integrate the doorbell into numerous automations, e.g. to turn off the doorbell automatically in the evening. The integrated motion sensor makes it possible to trigger automations when the bell is pressed.

**Requirements**

* Shelly 1 Plus (15 EUR)
* 12V DC Power Supply (12 EUR)
* Some wires and clamps
* Running Homebridge with this plugin installed
* **If you are not qualified and licensed to do electrical work, you will need an electrician to help you.**

# Supported old fashion doorbell with two wires

If your existing doorbell is installed and switched like this, you can make it "smart" with this plugin and a Shelly  Plus:

![alt text](img/wiring-before.png "Wiring Before")

**Note:** Shelly 1 supports a lot of voltages with both AC and DC on the relay, so even if your mechanical gong works with different voltages, there is a high chance that your environment is compatible with this plugin.

# Hardware (Shelly 1 Plus) installation

The special thing about this setup is that the Shelly 1 Plus is powered by a 12V DC power supply, so we can safely connect it to the doorbell. Under no circumstances should higher voltages be applied to the thin doorbell wires.

![alt text](img/wiring-after-with-shelly.png "Shelly 1 Installation")
This can also be applied to Shelly 1 Plus


**Warning:** Please also turn off "Settings" -> "FACTORY RESET" -> "Enable factory reset from switch" so that no one can reset your shelly via the doorbell.

# Plugin configuration

```javascript
{
    "name": "Shelly Doorbell",
    "homebridgeIp": "10.0.1.99",
    "doorbells": [
        {
            "shellyIP": "10.0.1.100",
        }
    ],
    "platform": "ShellyDoorbell"
}
```


| Setting | Example | Description |
| --- | --- | --- |
| name | Doorbell | Name of the doorbell |
| homebridgeIp* | 10.0.1.99 | IP of your Homebridge used to set up webhooks |
| shellyIP*  | 10.0.1.100 | IP of Shelly 1 Plus |
| shellyUsername  | admin | Username of Shelly 1 if login is restricted |
| shellyPassword  | password | Password of Shelly 1 if login is restricted |
| digitalDoorbellWebhookPort  | 9053 | HTTP Port for the digital doorbell trigger server |
| mechanicalDoorbellName  | Mechanical gong | What is connected to the relay (slots I and O) of your Shelly? |


\* Mandatory field.

# Doorbell controls

Please reboot homebridge after setup is completed. Now you should see the doorbell in your default room. On the left side you can enable or disable the "digital gong" (Push Notifications, HomePod ringing, Automations,...).
On the right side you can enable and disable your "mechanical gong". Both names can be changed via the configuration.

# Enjoy your smart doorbell 🚪🛎👍

**Note:** The authors of this plugin cannot assume any guarantees that the contents of this README are correct.

This is a fork of the original plugin by [Sebastian Lindenmüller](https://gitlab.com/ca-iot/homebridge-shelly-doorbell#readme)
