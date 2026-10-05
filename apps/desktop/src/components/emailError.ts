import { ApiError } from "../api";
import type { Messages } from "../i18n";

export function emailErrorMessage(failure: unknown, t: Messages): string {
    if (failure instanceof ApiError) {
        switch (failure.code) {
            case "email_transport_unavailable": return t.signupEmailTransportError;
            case "email_delivery_failed": return t.signupEmailDeliveryError;
            case "email_not_configured": return t.signupEmailNotConfigured;
        }
    }
    return failure instanceof Error ? failure.message : String(failure);
}
