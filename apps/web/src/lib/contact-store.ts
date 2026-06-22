export type CreateAddressInput = {
  address: string;
  jurisdiction?: string;
  category?: string;
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
