import type { Meta, StoryObj } from '@storybook/react-vite';
import { Tile } from './Tile';

const meta = {
  title: 'Data Display/Tile',
  component: Tile,
} satisfies Meta<typeof Tile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: { label: 'Uptime', children: '99.9%' },
};
