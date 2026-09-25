<?php

namespace App\Identity;

final class PermissionMatrix
{
    /** @return array<string, list<string>> */
    public static function grants(): array
    {
        return [
            'owner' => [
                'catalog.read_internal', 'catalog.create_update', 'catalog.publish_archive', 'media.manage',
                'inventory.read', 'inventory.adjust', 'inventory.movements.read', 'orders.read', 'orders.prepare',
                'shipments.record', 'delivery.record', 'orders.cancel', 'payments.read_summary', 'payments.reconcile',
                'exceptions.resolve', 'returns.read', 'returns.review', 'returns.decide', 'refunds.approve', 'refunds.submit',
                'reports.sales', 'reports.products', 'reports.orders', 'reports.stock', 'customers.read_operational',
                'tax.configure', 'shipping.configure', 'staff.provision', 'roles.assign', 'audit.read', 'security.configure',
            ],
            'order_processing' => ['catalog.read_internal', 'inventory.read', 'orders.read', 'orders.prepare',
                'shipments.record', 'delivery.record', 'payments.read_summary', 'returns.read', 'returns.review',
                'reports.orders', 'customers.read_operational'],
            'inventory_store' => ['catalog.read_internal', 'inventory.read', 'inventory.movements.read', 'reports.stock'],
        ];
    }
}
