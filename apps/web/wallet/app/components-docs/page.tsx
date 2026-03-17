'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Tabs } from '../components/Tabs';
import { Badge } from '../components/Badge';
import { Search } from '../components/Search';
import { Divider } from '../components/Divider';
import styles from './docs.module.css';

interface Component {
  name: string;
  category: string;
  description: string;
  props: string[];
  variants?: string[];
}

export default function ComponentDocsPage() {
  const [activeTab, setActiveTab] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '💰', label: 'Wallet', href: '/' },
    { icon: '🎨', label: 'Charts', href: '/charts' },
    { icon: '🎭', label: 'Showcase', href: '/showcase' },
    { icon: '📚', label: 'Docs', href: '/components-docs' },
  ];

  const components: Component[] = [
    {
      name: 'Button',
      category: 'Core',
      description: 'Interactive button with multiple variants and states',
      props: ['variant', 'size', 'disabled', 'fullWidth', 'icon', 'onClick'],
      variants: ['primary', 'secondary', 'outline', 'ghost', 'danger', 'success'],
    },
    {
      name: 'Badge',
      category: 'Core',
      description: 'Status indicator with color variants',
      props: ['variant', 'size', 'children'],
      variants: ['default', 'primary', 'success', 'warning', 'danger', 'info', 'custom'],
    },
    {
      name: 'Card',
      category: 'Layout',
      description: 'Container with glassmorphism effect',
      props: ['variant', 'children'],
      variants: ['default', 'glass', 'solid', 'hover'],
    },
    {
      name: 'Input',
      category: 'Forms',
      description: 'Text input with validation and icons',
      props: ['label', 'type', 'value', 'onChange', 'error', 'icon', 'helperText'],
    },
    {
      name: 'Checkbox',
      category: 'Forms',
      description: 'Checkbox input with custom styling',
      props: ['label', 'checked', 'onChange', 'disabled'],
    },
    {
      name: 'Dropdown',
      category: 'Forms',
      description: 'Select dropdown with icons',
      props: ['label', 'options', 'value', 'onChange'],
    },
    {
      name: 'Tabs',
      category: 'Navigation',
      description: 'Tabbed navigation component',
      props: ['tabs', 'activeTab', 'onChange'],
      variants: ['default', 'pills', 'underline'],
    },
    {
      name: 'Sidebar',
      category: 'Navigation',
      description: 'Collapsible sidebar navigation',
      props: ['items', 'collapsed', 'onCollapse'],
    },
    {
      name: 'AppLayout',
      category: 'Layout',
      description: 'Page layout wrapper with sidebar',
      props: ['sidebarItems', 'children'],
    },
    {
      name: 'Table',
      category: 'Data Display',
      description: 'Data table with sorting and pagination',
      props: ['columns', 'data', 'onRowClick', 'hoverable', 'striped'],
    },
    {
      name: 'Pagination',
      category: 'Data Display',
      description: 'Page navigation controls',
      props: ['currentPage', 'totalItems', 'itemsPerPage', 'onPageChange'],
    },
    {
      name: 'LineChart',
      category: 'Charts',
      description: 'Animated line chart visualization',
      props: ['data', 'color', 'height'],
    },
    {
      name: 'BarChart',
      category: 'Charts',
      description: 'Bar chart with direction toggle',
      props: ['data', 'color', 'height', 'direction'],
    },
    {
      name: 'DonutChart',
      category: 'Charts',
      description: 'Interactive donut/pie chart',
      props: ['data', 'size'],
    },
    {
      name: 'Modal',
      category: 'Overlays',
      description: 'Dialog modal with overlay',
      props: ['isOpen', 'onClose', 'title', 'children', 'footer', 'size'],
      variants: ['sm', 'md', 'lg', 'xl'],
    },
    {
      name: 'Toast',
      category: 'Overlays',
      description: 'Notification toast message',
      props: ['message', 'variant', 'duration', 'onClose'],
      variants: ['success', 'error', 'warning', 'info'],
    },
    {
      name: 'LoadingOverlay',
      category: 'Overlays',
      description: 'Full-screen loading state',
      props: ['isLoading', 'message', 'blur'],
    },
    {
      name: 'SkeletonLoader',
      category: 'Loading',
      description: 'Skeleton loading placeholders',
      props: ['variant', 'width', 'height', 'count'],
      variants: ['text', 'card', 'stat', 'table', 'chart', 'avatar', 'button'],
    },
    {
      name: 'Spinner',
      category: 'Loading',
      description: 'Loading spinner indicator',
      props: ['size', 'label'],
      variants: ['sm', 'md', 'lg'],
    },
    {
      name: 'ProgressBar',
      category: 'Feedback',
      description: 'Progress indicator bar',
      props: ['value', 'variant', 'showLabel'],
      variants: ['primary', 'success', 'warning', 'danger'],
    },
    {
      name: 'Avatar',
      category: 'Display',
      description: 'User avatar with status',
      props: ['src', 'alt', 'size', 'status'],
      variants: ['xs', 'sm', 'md', 'lg'],
    },
    {
      name: 'StatCard',
      category: 'Display',
      description: 'Statistics display card',
      props: ['title', 'value', 'trend', 'icon', 'iconBg', 'subtitle'],
    },
    {
      name: 'EmptyState',
      category: 'Display',
      description: 'Empty state placeholder',
      props: ['icon', 'title', 'description', 'action'],
    },
    {
      name: 'Tooltip',
      category: 'Feedback',
      description: 'Hover tooltip component',
      props: ['content', 'children', 'position'],
    },
    {
      name: 'CopyButton',
      category: 'Interactive',
      description: 'Copy to clipboard button',
      props: ['text', 'size'],
    },
    {
      name: 'IconButton',
      category: 'Interactive',
      description: 'Icon-only button',
      props: ['icon', 'onClick', 'variant'],
    },
    {
      name: 'AnimatedNumber',
      category: 'Animation',
      description: 'Animated number counter',
      props: ['value', 'duration'],
    },
    {
      name: 'PageTransition',
      category: 'Animation',
      description: 'Page transition wrapper',
      props: ['children'],
    },
    {
      name: 'Divider',
      category: 'Layout',
      description: 'Visual separator line',
      props: ['orientation', 'spacing'],
    },
    {
      name: 'NotificationCenter',
      category: 'Complex',
      description: 'Notification management center',
      props: ['notifications', 'onMarkRead', 'onClear'],
    },
  ];

  const categories = ['all', 'Core', 'Forms', 'Navigation', 'Layout', 'Data Display', 'Charts', 'Overlays', 'Loading', 'Feedback', 'Display', 'Interactive', 'Animation', 'Complex'];

  const filteredComponents = components.filter((comp) => {
    const matchesCategory = activeTab === 'all' || comp.category === activeTab;
    const matchesSearch = searchQuery === '' || 
      comp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      comp.description.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Component Library</h1>
            <p className={styles.subtitle}>
              {components.length} documented components • {categories.length - 1} categories
            </p>
          </div>
          <Badge variant="success" size="lg">v1.0.0</Badge>
        </header>

        <Card variant="glass">
          <CardBody>
            <div className={styles.controls}>
                  <Search
                    onChange={(query) => setSearchQuery(query)}
                    placeholder="Search components..."
                  />
            </div>

            <Tabs
              tabs={categories.map((cat) => ({
                id: cat,
                label:
                  cat === 'all'
                    ? `All (${components.length})`
                    : `${cat} (${components.filter((c) => c.category === cat).length})`,
              }))}
                    defaultTab="all"
                    onChange={(tabId) => setActiveTab(tabId)}
              variant="pills"
            />

            <div className={styles.componentGrid}>
              {filteredComponents.map((component) => (
                <div key={component.name} className={styles.componentCard}>
                  <div className={styles.componentHeader}>
                    <h3 className={styles.componentName}>{component.name}</h3>
                    <Badge variant="default">{component.category}</Badge>
                  </div>
                  <p className={styles.componentDescription}>
                    {component.description}
                  </p>
                  
                  <Divider />

                  <div className={styles.componentProps}>
                    <h4>Props:</h4>
                    <div className={styles.propsList}>
                      {component.props.map((prop) => (
                        <code key={prop} className={styles.propItem}>
                          {prop}
                        </code>
                      ))}
                    </div>
                  </div>

                  {component.variants && (
                    <div className={styles.componentVariants}>
                      <h4>Variants:</h4>
                      <div className={styles.variantsList}>
                        {component.variants.map((variant) => (
                          <Badge key={variant} variant="info" size="sm">
                            {variant}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {filteredComponents.length === 0 && (
              <div className={styles.noResults}>
                <span className={styles.noResultsIcon}>🔍</span>
                <h3>No components found</h3>
                <p>Try adjusting your search or filter</p>
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardBody>
            <h3 className={styles.sectionTitle}>Quick Stats</h3>
            <div className={styles.statsGrid}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{components.length}</span>
                <span className={styles.statLabel}>Total Components</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{categories.length - 1}</span>
                <span className={styles.statLabel}>Categories</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>
                  {components.reduce((sum, c) => sum + (c.variants?.length || 0), 0)}
                </span>
                <span className={styles.statLabel}>Total Variants</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>100%</span>
                <span className={styles.statLabel}>TypeScript</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
