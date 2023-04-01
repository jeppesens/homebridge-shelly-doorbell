export interface Config {
    name: string;
    shellyIP: string;
    shellyUsername?: string;
    shellyPassword?: string;
    digitalDoorbellWebhookPort: number;
    mechanicalDoorbellName?: string;
    homebridgeIp: string;
}