'use client';

import React, { useState } from 'react';
import { AppLayout } from '../components/AppLayout';
import { Card, CardBody } from '../components/Card';
import { Tabs } from '../components/Tabs';
import { Button } from '../components/Button';
import { Dropdown } from '../components/Dropdown';
import { LineChart } from '../components/LineChart';
import { BarChart } from '../components/BarChart';
import { DonutChart, DonutChartData } from '../components/DonutChart';
import { Badge } from '../components/Badge';
import { Divider } from '../components/Divider';
import styles from './charts.module.css';

export default function ChartsPage() {
  const [activeTab, setActiveTab] = useState('line');
  const [lineColor, setLineColor] = useState('#60a5fa');
  const [barColor, setBarColor] = useState('#a78bfa');
  const [barDirection, setBarDirection] = useState<'vertical' | 'horizontal'>('vertical');

  const sidebarItems = [
    { icon: '🏠', label: 'Dashboard', href: '/dashboard' },
    { icon: '⚙️', label: 'Operations', href: '/' },
    { icon: '📊', label: 'Metrics', href: '/metrics' },
    { icon: '🔔', label: 'Alerts', href: '/alerts' },
    { icon: '🌐', label: 'Network', href: '/network' },
    { icon: '🎨', label: 'Charts', href: '/charts' },
    { icon: '⚙️', label: 'Settings', href: '/settings' },
  ];

  // Line chart datasets
  const simpleLineData: Array<{ label: string; value: number }> = [];
  const volatileLineData: Array<{ label: string; value: number }> = [];
  const growthLineData: Array<{ label: string; value: number }> = [];

  // Bar chart datasets
  const simpleBarData: Array<{ label: string; value: number }> = [];
  const categoryBarData: Array<{ label: string; value: number }> = [];
  const comparisonBarData: Array<{ label: string; value: number }> = [];

  // Donut chart datasets
  const balanceDonutData: DonutChartData[] = [];
  const transactionTypeDonutData: DonutChartData[] = [];
  const poolDistributionDonutData: DonutChartData[] = [];

  const colorOptions = [
    { value: '#60a5fa', label: 'Blue', icon: '🔵' },
    { value: '#34d399', label: 'Green', icon: '🟢' },
    { value: '#a78bfa', label: 'Purple', icon: '🟣' },
    { value: '#f59e0b', label: 'Orange', icon: '🟠' },
    { value: '#f87171', label: 'Red', icon: '🔴' },
    { value: '#f472b6', label: 'Pink', icon: '🩷' },
  ];

  return (
    <AppLayout sidebarItems={sidebarItems}>
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Charts Gallery</h1>
            <p className={styles.subtitle}>
              Explore all available chart components and variations
            </p>
          </div>
          <Button variant="primary" icon={<span>📥</span>}>
            Export All
          </Button>
        </header>

        <Card variant="glass">
          <CardBody>
            <Tabs
              tabs={[
                { id: 'line', label: 'Line Charts', icon: '📈' },
                { id: 'bar', label: 'Bar Charts', icon: '📊' },
                { id: 'donut', label: 'Donut Charts', icon: '🍩' },
                { id: 'combined', label: 'Combined', icon: '🎨' },
              ]}
              activeTab={activeTab}
              onChange={setActiveTab}
              variant="pills"
            />

            {activeTab === 'line' && (
              <div className={styles.chartsSection}>
                <div className={styles.controls}>
                  <Dropdown
                    label="Chart Color"
                    options={colorOptions}
                    value={lineColor}
                    onChange={setLineColor}
                  />
                </div>

                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Simple Trend</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <LineChart data={simpleLineData} color={lineColor} height={250} />
                    <p className={styles.chartDescription}>
                        Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Volatile Data</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <LineChart data={volatileLineData} color={lineColor} height={250} />
                    <p className={styles.chartDescription}>
                        Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Exponential Growth</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <LineChart data={growthLineData} color={lineColor} height={250} />
                    <p className={styles.chartDescription}>
                        Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Custom Height</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <LineChart data={simpleLineData} color={lineColor} height={350} />
                    <p className={styles.chartDescription}>
                        Metrics not available yet
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'bar' && (
              <div className={styles.chartsSection}>
                <div className={styles.controls}>
                  <Dropdown
                    label="Chart Color"
                    options={colorOptions}
                    value={barColor}
                    onChange={setBarColor}
                  />
                  <Dropdown
                    label="Direction"
                    options={[
                      { value: 'vertical', label: 'Vertical' },
                      { value: 'horizontal', label: 'Horizontal' },
                    ]}
                    value={barDirection}
                    onChange={(val) => setBarDirection(val as 'vertical' | 'horizontal')}
                  />
                </div>

                <div className={styles.chartGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Weekly Activity</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <BarChart
                      data={simpleBarData}
                      color={barColor}
                      height={250}
                      direction={barDirection}
                    />
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Category Distribution</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <BarChart
                      data={categoryBarData}
                      color={barColor}
                      height={250}
                      direction={barDirection}
                    />
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Regional Comparison</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <BarChart
                      data={comparisonBarData}
                      color={barColor}
                      height={250}
                      direction={barDirection}
                    />
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Custom Height</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <BarChart
                      data={simpleBarData}
                      color={barColor}
                      height={350}
                      direction={barDirection}
                    />
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'donut' && (
              <div className={styles.chartsSection}>
                <div className={styles.donutGrid}>
                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Balance Distribution</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <div className={styles.donutWrapper}>
                      <DonutChart data={balanceDonutData} size={250} />
                    </div>
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Transaction Types</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <div className={styles.donutWrapper}>
                      <DonutChart data={transactionTypeDonutData} size={250} />
                    </div>
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Mining Pools</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <div className={styles.donutWrapper}>
                      <DonutChart data={poolDistributionDonutData} size={250} />
                    </div>
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Large Size</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <div className={styles.donutWrapper}>
                      <DonutChart data={balanceDonutData} size={320} />
                    </div>
                    <p className={styles.chartDescription}>
                      Metrics not available yet
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'combined' && (
              <div className={styles.chartsSection}>
                <div className={styles.combinedLayout}>
                  <div className={styles.combinedRow}>
                    <div className={styles.chartCard}>
                      <div className={styles.chartHeader}>
                        <h3>Revenue Trend</h3>
                        <Badge variant="default">No data</Badge>
                      </div>
                      <LineChart data={growthLineData} color="#34d399" height={200} />
                    </div>
                    <div className={styles.chartCard}>
                      <div className={styles.chartHeader}>
                        <h3>Category Split</h3>
                        <Badge variant="default">No data</Badge>
                      </div>
                      <div className={styles.donutWrapper}>
                        <DonutChart data={poolDistributionDonutData} size={200} />
                      </div>
                    </div>
                  </div>

                  <Divider />

                  <div className={styles.chartCard}>
                    <div className={styles.chartHeader}>
                      <h3>Weekly Performance</h3>
                      <Badge variant="default">No data</Badge>
                    </div>
                    <BarChart data={simpleBarData} color="#60a5fa" height={250} />
                  </div>

                  <Divider />

                  <div className={styles.combinedRow}>
                    <div className={styles.chartCard}>
                      <div className={styles.chartHeader}>
                        <h3>Regional Activity</h3>
                        <Badge variant="default">No data</Badge>
                      </div>
                      <BarChart
                        data={comparisonBarData}
                        color="#a78bfa"
                        height={200}
                        direction="horizontal"
                      />
                    </div>
                    <div className={styles.chartCard}>
                      <div className={styles.chartHeader}>
                        <h3>Balance Status</h3>
                        <Badge variant="default">No data</Badge>
                      </div>
                      <div className={styles.donutWrapper}>
                        <DonutChart data={balanceDonutData} size={200} />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card variant="glass">
          <CardBody>
            <h3 className={styles.sectionTitle}>Chart Features</h3>
            <div className={styles.featuresGrid}>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>🎨</span>
                <h4>Customizable Colors</h4>
                <p>Change chart colors with a single prop</p>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>📏</span>
                <h4>Flexible Heights</h4>
                <p>Adjust height to fit any layout</p>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>✨</span>
                <h4>Smooth Animations</h4>
                <p>Animated transitions and interactions</p>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>📱</span>
                <h4>Fully Responsive</h4>
                <p>Adapts to all screen sizes</p>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>🔄</span>
                <h4>Direction Toggle</h4>
                <p>Vertical or horizontal bar charts</p>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureIcon}>🎯</span>
                <h4>Interactive</h4>
                <p>Hover tooltips and clickable segments</p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </AppLayout>
  );
}
