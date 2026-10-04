<?php

namespace App\Communications;

use Illuminate\Support\Facades\Mail;
use Resend\Exceptions\ErrorException as ResendErrorException;
use Symfony\Component\Mailer\Exception\TransportExceptionInterface;

final class MailTransport
{
    /** @param array<string,mixed> $payload
     * @return array{status:string,code:?string,message_id:?string}
     */
    public function send(string $recipient, array $payload, string $id): array
    {
        $mode = app()->environment();
        $mailer = $mode === 'testing' ? 'array' : ($mode === 'local' ? (config('mail.default') === 'mailpit' ? 'mailpit' : 'array') : config('mail.default'));
        $capture = $mode === 'local' && $mailer === 'mailpit';
        $simulated = $mailer === 'array' || $capture;
        try {
            NotificationContent::origin();
            if (! filter_var($recipient, FILTER_VALIDATE_EMAIL) || preg_match('/[\r\n]/', $recipient)) {
                return $this->result('FAILED', 'RECIPIENT_INVALID');
            }
            if (! in_array($mode, ['local', 'testing', 'staging', 'production'], true)) {
                return $this->result('FAILED', 'ENVIRONMENT_INVALID');
            }
            if (! $simulated) {
                if (! in_array($mailer, ['smtp', 'ses', 'postmark', 'resend'], true)) {
                    return $this->result('FAILED', 'MAILER_NOT_APPROVED');
                }
                if (! MailConfiguration::senderConfigured()) {
                    return $this->result('FAILED', 'SENDER_NOT_CONFIGURED');
                }
                if ($mailer === 'resend' && ! MailConfiguration::resendConfigured()) {
                    return $this->result('FAILED', 'RESEND_NOT_CONFIGURED');
                }
                if ($mailer === 'smtp' && (config('mail.mailers.smtp.url') || ! config('mail.mailers.smtp.host') || in_array(config('mail.mailers.smtp.host'), ['localhost', '127.0.0.1'], true) || config('mail.mailers.smtp.scheme') !== 'smtps')) {
                    return $this->result('FAILED', 'SMTP_NOT_CONFIGURED');
                }
                if ($mode === 'staging') {
                    $sink = config('communications.staging_recipient');
                    if (! is_string($sink) || ! filter_var($sink, FILTER_VALIDATE_EMAIL)) {
                        return $this->result('FAILED', 'STAGING_RECIPIENT_REQUIRED');
                    }
                    $recipient = $sink;
                }
            } elseif (! in_array($mode, ['local', 'testing'], true)) {
                return $this->result('FAILED', 'EXTERNAL_TRANSPORT_REQUIRED');
            }
            if (config('communications.reply_to') && ! filter_var(config('communications.reply_to'), FILTER_VALIDATE_EMAIL)) {
                return $this->result('FAILED', 'REPLY_TO_INVALID');
            }
            $sent = Mail::mailer($mailer)->to($recipient)->send(new TransactionalMail($payload, $id));
            if (! $sent) {
                return $this->result('FAILED', 'TRANSPORT_CANCELLED');
            }
            $messageId = $sent->getMessageId();

            return ['status' => $simulated ? 'SIMULATED' : 'SENT', 'code' => null, 'message_id' => strlen($messageId) <= 160 ? $messageId : null];
        } catch (\LogicException|\InvalidArgumentException) {
            return $this->result('FAILED', 'CONFIGURATION_OR_TEMPLATE_INVALID');
        } catch (TransportExceptionInterface $e) {
            if ($mailer === 'resend') {
                return $this->resendFailure($e);
            }
            $code = $e->getCode();

            return $this->result($code >= 400 && $code < 500 ? 'RETRY' : ($code >= 500 && $code < 600 ? 'FAILED' : 'UNKNOWN'), $code >= 400 && $code < 500 ? 'TEMPORARY_REJECTION' : ($code >= 500 && $code < 600 ? 'PERMANENT_REJECTION' : 'TRANSPORT_OUTCOME_UNKNOWN'));
        } catch (\Throwable) {
            return $this->result('UNKNOWN', 'TRANSPORT_OUTCOME_UNKNOWN');
        }
    }

    /** @return array{status:string,code:string,message_id:null} */
    private function result(string $status, string $code): array
    {
        return ['status' => $status, 'code' => $code, 'message_id' => null];
    }

    /** @return array{status:string,code:string,message_id:null} */
    private function resendFailure(TransportExceptionInterface $exception): array
    {
        $cause = $exception->getPrevious();
        if (! $cause instanceof ResendErrorException) {
            // A lost HTTP response can follow provider acceptance; do not blindly resend.
            return $this->result('UNKNOWN', 'TRANSPORT_OUTCOME_UNKNOWN');
        }
        $status = $cause->getErrorCode();

        return match (true) {
            $status === 429 => $this->result('RETRY', 'PROVIDER_RATE_LIMITED'),
            in_array($status, [401, 403], true) => $this->result('FAILED', 'PROVIDER_AUTH_REJECTED'),
            $status >= 400 && $status < 500 => $this->result('FAILED', 'PROVIDER_REJECTED'),
            default => $this->result('UNKNOWN', 'TRANSPORT_OUTCOME_UNKNOWN'),
        };
    }
}
