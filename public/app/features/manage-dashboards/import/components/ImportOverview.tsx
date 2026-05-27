import { locationService } from '@grafana/runtime';
import { isDashboardV1Spec, isDashboardV2Spec } from 'app/features/dashboard/api/utils';

import { type DashboardInputs, type DashboardSource } from '../../types';

import { ImportOverviewV1 } from './ImportOverviewV1';
import { ImportOverviewV2 } from './ImportOverviewV2';

type Props = {
  dashboard: unknown;
  dashboardUid?: string;
  inputs: DashboardInputs;
  meta: { updatedAt: string; orgName: string };
  source: DashboardSource;
  onCancel: () => void;
};

export function getAssetIdFromIframe() {
  const iframe = window.parent.document.querySelector('iframe');

  if (!iframe) {
    console.warn('No iframe found.');
    return null;
  }

  const src = iframe.src;
  if (!src) {
    console.warn('The iframe has no src attribute.');
    return null;
  }

  const params = new URLSearchParams(new URL(src).search);
  return params.get('assetId');
}

export function ImportOverview({ dashboard, dashboardUid, inputs, meta, source, onCancel }: Props) {
  const searchObj = locationService.getSearchObject();
  const folderUid = searchObj.folderUid ? String(searchObj.folderUid) : '';

  if (isDashboardV2Spec(dashboard)) {
    return (
      <ImportOverviewV2
        dashboard={dashboard}
        dashboardUid={dashboardUid}
        inputs={inputs}
        meta={meta}
        source={source}
        folderUid={folderUid}
        onCancel={onCancel}
      />
    );
  }

  if (isDashboardV1Spec(dashboard)) {
    return (
      <ImportOverviewV1
        dashboard={dashboard}
        inputs={inputs}
        meta={meta}
        source={source}
        folderUid={folderUid}
        onCancel={onCancel}
      />
    );
  }

  return null;
}
