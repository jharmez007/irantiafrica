New message from the IRANTI Africa website

Name: {{ $contact['name'] }}
Email: {{ $contact['email'] }}
Phone: {{ $contact['phone'] ?: 'Not provided' }}
Subject: {{ $contact['subject'] }}

Message:
{{ $contact['message'] }}
