export type CreateAddressInput = {
  address: string;
  jurisdictionCode?: string;
  purposeCode?: string;
  entityId?: string;
};

export type ContactAddress = CreateAddressInput & {
  id: string;
};

export type Contact = {
  id: string;
  userId: string;
  name: string;
  type: 'individual' | 'group';
  addresses: ContactAddress[];
  createdAt: number;
  updatedAt: number;
};
