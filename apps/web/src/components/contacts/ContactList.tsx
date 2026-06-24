'use client';

import { useState } from 'react';
import { useContacts, useDeleteContact } from '@/hooks/useContacts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  SidebarGroup,
  SidebarGroupContent,
} from '@/components/ui/sidebar';
import { Loader2, Users, User, Trash2, MapPin, Tag, Globe } from 'lucide-react';
import { ContactForm } from './ContactForm';
import { toast } from 'sonner';
import type { Contact } from '@/lib/contact-store';

type ContactListProps = {
  walletAddress?: string;
  showForm: boolean;
  onCloseForm: () => void;
};

export function ContactList({ walletAddress, showForm, onCloseForm }: ContactListProps) {
  const [editingContact, setEditingContact] = useState<Contact | null>(null);

  const { data: contacts = [], isLoading } = useContacts(walletAddress);
  const { mutate: deleteContact, isPending: isDeleting } = useDeleteContact();

  const handleDelete = (e: React.MouseEvent, contactId: string) => {
    e.stopPropagation();
    deleteContact(
      { contactId, userId: walletAddress! },
      {
        onSuccess: () => toast.success('Contact deleted'),
        onError: () => toast.error('Failed to delete contact'),
      }
    );
  };

  const handleEdit = (contact: Contact) => {
    setEditingContact(contact);
  };

  const handleCloseForm = () => {
    setEditingContact(null);
    onCloseForm();
  };

  // Helper to get audit fields safely
  const getAuditBadge = (contact: Contact) => {
      const addr = contact.addresses.find(a => a.entityId || a.jurisdictionCode || a.purposeCode);
      if (!addr) return null;
      return {
          jurisdictionCode: addr.jurisdictionCode,
          purposeCode: addr.purposeCode,
          entityId: addr.entityId
      };
  };

  if (showForm || editingContact) {
    return (
      <ContactForm
        walletAddress={walletAddress}
        contact={editingContact}
        onClose={handleCloseForm}
      />
    );
  }

  return (
    <SidebarGroup className="px-0">
      <SidebarGroupContent>
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No contacts yet. Add one to pre-fill audit records on future payments.
          </div>
        ) : (
          <div className="space-y-1 p-2">
            {contacts.map((contact) => {
              const audit = getAuditBadge(contact);
              return (
                <div
                  key={contact.id}
                  className="group flex items-start gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer"
                  onClick={() => handleEdit(contact)}
                >
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted-foreground/10 shrink-0 mt-0.5">
                    {contact.type === 'group' ? (
                      <Users className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{contact.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {contact.addresses.length === 1
                        ? `${contact.addresses[0].address.slice(0, 6)}...${contact.addresses[0].address.slice(-4)}`
                        : `${contact.addresses.length} addresses`}
                    </div>
                    {audit && (
                        <div className="flex gap-2 text-xs mt-3">
                            {audit.entityId && (
                                <Badge variant="outline" className="bg-muted/50 text-[10px] py-0">Ref: {audit.entityId}</Badge>
                            )}
                            {audit.jurisdictionCode && (
                                <Badge variant="outline" className="bg-muted/50 text-[10px] py-0 font-normal">
                                    <Globe className="h-3 w-3 mr-1 opacity-70" />
                                    {audit.jurisdictionCode}
                                </Badge>
                            )}
                            {audit.purposeCode && (
                                <Badge variant="outline" className="bg-muted/50 text-[10px] py-0 font-normal">
                                    <Tag className="h-3 w-3 mr-1 opacity-70" />
                                    {audit.purposeCode}
                                </Badge>
                            )}
                        </div>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 h-8 w-8 shrink-0"
                    onClick={(e) => handleDelete(e, contact.id)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
