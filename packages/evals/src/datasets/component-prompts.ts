/**
 * Golden Dataset of Component & Page Object Prompts
 */

export interface GoldenComponentPrompt {
  id: string;
  name: string;
  userPrompt: string;
  targetFile: string;
  expectedClass: string;
  expectedMethods: string[];
  expectedNowGetters: string[];
}

export const GOLDEN_COMPONENT_PROMPTS: GoldenComponentPrompt[] = [
  {
    id: 'COMP-01-USER-PROFILE',
    name: 'UserProfileCard Component',
    userPrompt:
      'Create a CPOM component for UserProfileCard containing user avatar, fullName, email, role badge, and editButton.',
    targetFile: 'components/widgets/user-profile-card.ts',
    expectedClass: 'UserProfileCard',
    expectedMethods: ['clickEdit', 'fullNameNow', 'emailNow', 'roleNow', 'isAvatarVisibleNow'],
    expectedNowGetters: ['fullNameNow', 'emailNow', 'roleNow', 'isAvatarVisibleNow'],
  },
  {
    id: 'PAGE-01-CHECKOUT',
    name: 'CheckoutPage Page Object',
    userPrompt:
      'Create a CPOM Page Object for CheckoutPage (/checkout) composing OrderSummaryWidget, ShippingForm, and PaymentWidget with submitOrder() method.',
    targetFile: 'components/pages/checkout.page.ts',
    expectedClass: 'CheckoutPage',
    expectedMethods: ['submitOrder', 'isOrderPlacedNow'],
    expectedNowGetters: ['isOrderPlacedNow'],
  },
];
