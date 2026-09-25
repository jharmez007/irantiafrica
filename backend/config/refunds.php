<?php

return ['enabled' => (bool) env('REFUNDS_ENABLED', false), 'live_approved' => (bool) env('PAYSTACK_REFUNDS_LIVE_APPROVED', false), 'max_checks' => 12];
