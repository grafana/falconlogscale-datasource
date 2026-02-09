import { reportInteraction } from '@grafana/runtime';

export const trackConfigSetNGSIEMMode = () => {
    reportInteraction('grafana_falconlogscale_ngsiem_mode_enabled');
};
