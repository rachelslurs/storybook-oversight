import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './Badge';

const meta = {
  title: 'Data Display/Badge',
  component: Badge,
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = { args: { children: 'Draft' } };
export const Success: Story = { args: { tone: 'success', children: 'Live' } };
