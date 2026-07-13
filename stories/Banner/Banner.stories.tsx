import type { Meta, StoryObj } from '@storybook/react-vite';
import { Banner } from './Banner';

const meta = {
  title: 'Feedback/Banner',
  component: Banner,
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { children: 'Scheduled maintenance tonight at 11pm.' },
};
