import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './Card';

const meta = {
  title: 'Data Display/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { title: 'Weekly summary', children: 'Everything is on track.' },
};

export const Elevated: Story = {
  args: { title: 'Elevated', elevated: true, children: 'Lifted off the page.' },
};
