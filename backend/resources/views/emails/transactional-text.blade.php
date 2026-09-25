IRANTI AFRICA — MEMORIES OF NIGERIA
{!! $heading !!}

{!! $messageText !!}

Order: {!! $content['order_number'] !!}
Order date: {!! $content['order_date'] !!}
Event recorded: {!! $content['occurred_at'] !!}
This message records an event. Later updates may be available on your order page.

@if(isset($content['return_reference']))
Return: {!! $content['return_reference'] !!}
@foreach($content['return_items'] as $item)
{!! $item['name'] !!} — Requested {!! $item['quantity'] !!}@if($content['event'] !== 'ReturnRequested'), approved {!! $item['approved_quantity'] !!}@endif
@endforeach
@else
@foreach($content['items'] as $item)
{!! $item['name'] !!} — Quantity {!! $item['quantity'] !!}, each {!! \App\Communications\NotificationContent::money($item['unit_price_minor']) !!}
@endforeach
@endif
@if(isset($content['refund_minor']))
Refund amount: {!! \App\Communications\NotificationContent::money($content['refund_minor']) !!}
@endif

Original order totals
Items: {!! \App\Communications\NotificationContent::money($content['subtotal_minor']) !!}
Item tax: {!! \App\Communications\NotificationContent::money($content['product_tax_minor']) !!}
Delivery: {!! \App\Communications\NotificationContent::money($content['delivery_minor']) !!}
Delivery tax: {!! \App\Communications\NotificationContent::money($content['delivery_tax_minor']) !!}
Total: {!! \App\Communications\NotificationContent::money($content['total_minor']) !!}
@if(isset($content['shipment']))
Carrier: {!! $content['shipment']['carrier'] !!}
Tracking number: {!! $content['shipment']['tracking_number'] !!}
Dispatched: {!! $content['shipment']['shipped_at'] !!}
@if($content['shipment']['tracking_url'])Track shipment: {!! $content['shipment']['tracking_url'] !!}@endif
@endif

@if($orderUrl)View your order securely: {!! $orderUrl !!}
@else
Use the original order page in the browser where you placed the order. This message does not grant or renew guest access. Contact the store through its published support channel if access has expired.
@endif

IRANTI Africa
Transactional order update. Do not reply with payment credentials, passwords or verification codes.
