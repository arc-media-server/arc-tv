import { api, ApiError } from '../api';
import { t } from '../i18n';
import { deviceLogPayload } from './device-logs';
import { toast } from './toast';

export async function sendDeviceLogs() {
  const body = deviceLogPayload();
  if (!body.entries.length) {
    toast(t('diagnostics.empty'));
    return false;
  }
  try {
    await api('/client-logs', { method: 'POST', body });
    toast(t('diagnostics.sent'));
    return true;
  } catch (err) {
    toast(t(err instanceof ApiError && err.status === 404 ? 'diagnostics.unsupported' : 'diagnostics.failed'));
    return false;
  }
}
