<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{{ $heading }}</title></head>
<body style="margin:0;background:#f4eee1;color:#3c4142;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:16px 8px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#fff;table-layout:fixed;"><tr><td style="padding:24px;overflow-wrap:anywhere;word-break:break-word;">
<img src="{{ $logoUrl }}" alt="IRANTI Africa" width="132" height="132" style="display:block;width:132px;height:132px;max-width:100%;">
<p style="color:#335438;font-size:13px;letter-spacing:2px;">IRANTI AFRICA · MEMORIES OF NIGERIA</p>
<h1 style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;color:#335438;">{{ $heading }}</h1>
<p>{{ $messageText }}</p>
<p><strong>Order {{ $content['order_number'] }}</strong><br>Ordered {{ $content['order_date'] }}<br>Event recorded {{ $content['occurred_at'] }}</p>
<p style="font-size:14px;">This message records a lifecycle event. Later updates may already be available on your order page.</p>
@if(isset($content['return_reference']))
<h2 style="font-size:20px;color:#335438;">Return {{ $content['return_reference'] }}</h2>
@foreach($content['return_items'] as $item)
<p><strong>{{ $item['name'] }}</strong><br>Requested: {{ $item['quantity'] }}@if($content['event'] !== 'ReturnRequested') · Approved: {{ $item['approved_quantity'] }}@endif</p>
@endforeach
@else
<h2 style="font-size:20px;color:#335438;">Your items</h2>
@foreach($content['items'] as $item)
<p><strong>{{ $item['name'] }}</strong><br>Quantity: {{ $item['quantity'] }} · Each {{ \App\Communications\NotificationContent::money($item['unit_price_minor']) }}</p>
@endforeach
@endif
@if(isset($content['refund_minor']))
<p><strong>Refund amount: {{ \App\Communications\NotificationContent::money($content['refund_minor']) }}</strong></p>
@endif
<h2 style="font-size:20px;color:#335438;">Original order totals</h2>
<p>Items: {{ \App\Communications\NotificationContent::money($content['subtotal_minor']) }}<br>Item tax: {{ \App\Communications\NotificationContent::money($content['product_tax_minor']) }}<br>Delivery: {{ \App\Communications\NotificationContent::money($content['delivery_minor']) }}<br>Delivery tax: {{ \App\Communications\NotificationContent::money($content['delivery_tax_minor']) }}<br><strong>Total: {{ \App\Communications\NotificationContent::money($content['total_minor']) }}</strong></p>
@if(isset($content['shipment']))
<h2 style="font-size:20px;color:#335438;">Tracking</h2>
<p>Carrier: {{ $content['shipment']['carrier'] }}<br>Tracking number: {{ $content['shipment']['tracking_number'] }}<br>Dispatched: {{ $content['shipment']['shipped_at'] }}</p>
@if($content['shipment']['tracking_url'])<p><a href="{{ $content['shipment']['tracking_url'] }}" style="color:#335438;">Track your shipment with {{ $content['shipment']['carrier'] }}</a></p>@endif
@endif
@if($orderUrl)<p style="margin:24px 0;"><a href="{{ $orderUrl }}" style="display:inline-block;background:#335438;color:#f4eee1;padding:12px 18px;text-decoration:none;">View your order securely</a></p>
@else<p>Use the original order page in the browser where you placed the order. This email does not grant access or renew guest access. If that access has expired, contact the store through its published support channel.</p>@endif
<hr style="border:0;border-top:2px solid #b85a22;">
<p style="font-size:14px;">IRANTI Africa<br>This is a transactional update about your order. No payment, password or verification code should be sent in a reply.</p>
</td></tr></table></td></tr></table></body></html>
