export type SkeletonColumn = {
  label: string;
  width?: string;
  cell?: 'text' | 'person' | 'badge' | 'action' | 'number' | 'date' | 'image';
};

export type SkeletonField = {
  label: string;
  type?: 'input' | 'textarea' | 'select' | 'toggle' | 'upload';
  fullWidth?: boolean;
};

export type SkeletonBlock =
  | {
      kind: 'ticket-orders';
      rows?: number;
    }
  | {
      kind: 'speaker-conference-intake';
    }
  | {
      kind: 'learning-lobby';
    }
  | {
      kind: 'operations-directory';
      view: 'events' | 'access';
      owner?: boolean;
    }
  | {
      kind: 'form-board';
      count: number;
    }
  | {
      kind: 'registration-summary';
    }
  | {
      kind: 'work-plan';
      view: 'board' | 'ledger' | 'phone';
      assigned?: boolean;
    }
  | {
      kind: 'heading';
      title: string;
      eyebrow?: string;
      description?: string;
      action?: string;
      level?: 'page' | 'section';
    }
  | {
      kind: 'tabs';
      labels: string[];
      active?: number;
    }
  | {
      kind: 'toolbar';
      search?: string;
      filters?: string[];
      actions?: string[];
    }
  | {
      kind: 'stats';
      labels: string[];
      columns?: number;
      details?: string[];
      compact?: boolean;
    }
  | {
      kind: 'table';
      columns: SkeletonColumn[];
      rows?: number;
      mobile?: 'scroll' | 'cards';
    }
  | {
      kind: 'cards';
      columns?: number;
      count?: number;
      title?: string;
      description?: string;
      media?: 'image' | 'icon' | 'avatar' | 'none';
      meta?: string[];
      actions?: string[];
    }
  | {
      kind: 'form';
      title?: string;
      description?: string;
      columns?: number;
      fields: SkeletonField[];
      actions?: string[];
    }
  | {
      kind: 'split';
      ratio?: 'sidebar' | 'content-sidebar' | 'equal';
      blocks: SkeletonBlock[][];
    }
  | {
      kind: 'board';
      columns: string[];
      cards?: number;
    }
  | {
      kind: 'list';
      title?: string;
      rows?: number;
      avatar?: boolean;
      secondary?: string;
      actions?: string[];
      labels?: string[];
      compact?: boolean;
    }
  | {
      kind: 'qr';
      count?: number;
      columns?: number;
    }
  | {
      kind: 'hero';
      title: string;
      description?: string;
      media?: boolean;
      action?: string;
    }
  | {
      kind: 'chart';
      title?: string;
      chart?: 'bars' | 'trend' | 'calendar';
    }
  | {
      kind: 'progress';
      label: string;
    }
  | {
      kind: 'section';
      title?: string;
      description?: string;
      blocks: SkeletonBlock[];
      plain?: boolean;
    };

export type SkeletonSection = {
  id: string;
  label: string;
  route: string;
  sourcePaths: string[];
  capture: {
    maxWidth: number;
    padding?: number;
    innerPadding?: number;
    context?: 'page' | 'panel' | 'drawer' | 'sidebar' | 'phone' | 'standalone';
    fraction?: number;
    gap?: number;
    collapseAt?: number;
    topOffset?: number;
    align?: 'center';
    publicFormFrame?: 'art' | 'center';
    showHeader?: boolean;
  };
  blocks: SkeletonBlock[];
};
