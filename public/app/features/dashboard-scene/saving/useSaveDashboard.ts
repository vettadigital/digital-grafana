import { useAsyncFn } from 'react-use';

import { locationUtil } from '@grafana/data';
import { t } from '@grafana/i18n';
import { locationService } from '@grafana/runtime';
import { type Dashboard } from '@grafana/schema';
import { type Spec as DashboardV2Spec } from '@grafana/schema/apis/dashboard.grafana.app/v2';
import { appEvents } from 'app/core/app_events';
import { useAppNotification } from 'app/core/copy/appNotification';
import { updateDashboardName } from 'app/core/reducers/navBarTree';
import { useSaveDashboardMutation } from 'app/features/browse-dashboards/api/browseDashboardsAPI';
import {
  type SaveDashboardAsOptions,
  type SaveDashboardOptions,
} from 'app/features/dashboard/components/SaveDashboard/types';
import { DashboardSavedEvent } from 'app/types/events';
import { useDispatch } from 'app/types/store';

import { updateDashboardUidLastUsedDatasource } from '../../dashboard/utils/dashboard';
import { type DashboardScene } from '../scene/DashboardScene';
import { DashboardInteractions } from '../utils/interactions';
import { trackDashboardSceneCreatedOrSaved } from '../utils/tracking';

function applyChrononVariablesToTargets(saveModel: any) {
  if (!Array.isArray(saveModel?.panels) || !Array.isArray(saveModel?.templating?.list)) {
    return saveModel;
  }

  const variableNames = saveModel.templating.list.map((variable: any) => variable.name);
  const variablesAsProps = Object.fromEntries(
    variableNames.map((variableName: any) => [variableName, `$${variableName}`])
  );

  const updatedPanels = saveModel.panels.map((panel: any) => {
    if (panel?.datasource?.type === 'chronon-datasource' && Array.isArray(panel.targets)) {
      const updatedTargets = panel.targets.map((target: any) => ({ ...target, ...variablesAsProps }));
      return { ...panel, targets: updatedTargets };
    }

    return panel;
  });

  return { ...saveModel, panels: updatedPanels };
}

function validateDescription(saveModel: any) {
  if (saveModel.description === '') {
    delete saveModel.description;
  }
}

export function useSaveDashboard(isCopy = false) {
  const dispatch = useDispatch();
  const notifyApp = useAppNotification();
  const [saveDashboardRtkQuery] = useSaveDashboardMutation();

  const [state, onSaveDashboard] = useAsyncFn(
    async (
      scene: DashboardScene,
      options: SaveDashboardOptions &
        SaveDashboardAsOptions & {
          // When provided, will take precedence over the scene's save model
          rawDashboardJSON?: Dashboard | DashboardV2Spec;
        }
    ) => {
      {
        let saveModel = options.rawDashboardJSON ?? scene.getSaveModel();

        saveModel = applyChrononVariablesToTargets(saveModel);

        if (options.saveAsCopy) {
          saveModel = scene.getSaveAsModel({
            isNew: options.isNew,
            title: options.title,
            description: options.description,
            copyTags: options.copyTags,
          });
        }

        validateDescription(saveModel);

        const result = await saveDashboardRtkQuery({
          dashboard: saveModel,
          folderUid: options.folderUid,
          message: options.message,
          overwrite: options.overwrite,
          showErrorAlert: false,
          k8s: options.k8s,
        });

        if ('error' in result) {
          throw result.error;
        }

        // result.data is readonly so spreading to allow for slug edits
        const resultData: typeof result.data = { ...result.data };

        // TODO: use slug from response once implemented
        // reuse existing slug to avoid "Unsaved changes" modal after save
        //   due to slugify logic difference between frontend and backend
        if (!result.data.slug && scene.state.meta.slug) {
          const slug = scene.state.meta.slug;
          resultData.slug = slug;
          resultData.url = `${result.data.url}/${slug}`;
        }

        scene.saveCompleted(saveModel, resultData, options.folderUid);

        // important that these happen before location redirect below
        appEvents.publish(new DashboardSavedEvent());
        notifyApp.success(t('dashboard-scene.use-save-dashboard.message-dashboard-saved', 'Dashboard saved'));

        updateDashboardUidLastUsedDatasource(resultData.uid);

        if (isCopy) {
          DashboardInteractions.dashboardCopied({ name: saveModel.title || '', url: resultData.url });
        } else {
          trackDashboardSceneCreatedOrSaved(!!options.isNew, scene, {
            name: saveModel.title || '',
            url: resultData.url || '',
            transformation_counts: scene.getTransformationCounts(saveModel),
            expression_counts: scene.getExpressionCounts(saveModel),
          });
        }

        const currentLocation = locationService.getLocation();
        const newUrl = locationUtil.stripBaseFromUrl(resultData.url);

        if (newUrl !== currentLocation.pathname) {
          setTimeout(() => {
            locationService.push({ pathname: newUrl, search: currentLocation.search });
          });
        }

        if (scene.state.meta.isStarred) {
          dispatch(
            updateDashboardName({
              id: resultData.uid,
              title: scene.state.title,
              url: newUrl,
            })
          );
        }

        const params = new URLSearchParams(window.location.search);
        const assetId = params.get('assetId');

        window.parent.postMessage(
          {
            source: 'grafana-dashboard-integration-event',
            payload: {
              uid: resultData.uid,
              assetId,
            },
          },
          '*'
        );

        return result.data;
      }
    },
    [dispatch, notifyApp]
  );

  return { state, onSaveDashboard };
}
