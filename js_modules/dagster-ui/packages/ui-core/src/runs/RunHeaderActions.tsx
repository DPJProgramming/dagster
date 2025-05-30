import {Button, Group, Icon, Menu, MenuItem, Popover, Tooltip} from '@dagster-io/ui-components';
import {useContext, useState} from 'react';
import {useHistory} from 'react-router-dom';
import {RunAlertNotifications} from 'shared/runs/RunAlertNotifications.oss';
import {RunMetricsDialog} from 'shared/runs/RunMetricsDialog.oss';

import {DeletionDialog} from './DeletionDialog';
import {QueuedRunCriteriaDialog} from './QueuedRunCriteriaDialog';
import {RunConfigDialog} from './RunConfigDialog';
import {RunPoolsDialog} from './RunPoolsDialog';
import {doneStatuses} from './RunStatuses';
import {RunsQueryRefetchContext} from './RunUtils';
import {TerminationDialog} from './TerminationDialog';
import {useMutation} from '../apollo-client';
import {isExternalRun} from './externalRuns';
import {RunFragment} from './types/RunFragments.types';
import {AppContext} from '../app/AppContext';
import {showSharedToaster} from '../app/DomUtils';
import {RunStatus} from '../graphql/types';
import {FREE_CONCURRENCY_SLOTS_MUTATION} from '../instance/InstanceConcurrencyKeyInfo';
import {
  FreeConcurrencySlotsMutation,
  FreeConcurrencySlotsMutationVariables,
} from '../instance/types/InstanceConcurrencyKeyInfo.types';
import {AnchorButton} from '../ui/AnchorButton';
import {workspacePipelineLinkForRun, workspacePipelinePath} from '../workspace/workspacePath';

type VisibleDialog =
  | 'config'
  | 'delete'
  | 'terminate'
  | 'queue-criteria'
  | 'free_slots'
  | 'metrics'
  | 'pools'
  | null;

export const RunHeaderActions = ({run, isJob}: {run: RunFragment; isJob: boolean}) => {
  const runMetricsEnabled = run.hasRunMetricsEnabled;

  const [visibleDialog, setVisibleDialog] = useState<VisibleDialog>(null);

  const {rootServerURI} = useContext(AppContext);
  const {refetch} = useContext(RunsQueryRefetchContext);

  const history = useHistory();

  const [freeSlots] = useMutation<
    FreeConcurrencySlotsMutation,
    FreeConcurrencySlotsMutationVariables
  >(FREE_CONCURRENCY_SLOTS_MUTATION);

  const freeConcurrencySlots = async () => {
    const resp = await freeSlots({variables: {runId: run.id}});
    if (resp.data?.freeConcurrencySlots) {
      await showSharedToaster({
        intent: 'success',
        icon: 'check_circle',
        message: 'Freed concurrency slots',
      });
    }
  };

  const jobLink = workspacePipelineLinkForRun({
    repositoryName: run.repositoryOrigin?.repositoryName,
    repositoryLocationName: run.repositoryOrigin?.repositoryLocationName,
    run,
    isJob,
  });

  return (
    <div>
      <Group direction="row" spacing={8}>
        <RunAlertNotifications runId={run.id} />
        {jobLink.disabledReason ? (
          <Tooltip content={jobLink.disabledReason} useDisabledButtonTooltipFix>
            <Button icon={<Icon name={jobLink.icon} />} disabled>
              {jobLink.label}
            </Button>
          </Tooltip>
        ) : (
          <AnchorButton icon={<Icon name={jobLink.icon} />} to={jobLink.to}>
            {jobLink.label}
          </AnchorButton>
        )}
        <Button icon={<Icon name="tag" />} onClick={() => setVisibleDialog('config')}>
          View tags and config
        </Button>
        {run.allPools && run.allPools.length ? (
          <Tooltip content="View pools" position="top" targetTagName="div">
            <Button icon={<Icon name="concurrency" />} onClick={() => setVisibleDialog('pools')} />
          </Tooltip>
        ) : null}
        {!isExternalRun(run) || run.hasDeletePermission ? (
          <Popover
            position="bottom-right"
            content={
              <Menu>
                {!isExternalRun(run) ? (
                  <>
                    <Tooltip
                      content="Loadable in dagster-webserver-debug"
                      position="left"
                      targetTagName="div"
                    >
                      <MenuItem
                        text="Download debug file"
                        icon="download_for_offline"
                        // eslint-disable-next-line no-restricted-properties
                        onClick={() => window.open(`${rootServerURI}/download_debug/${run.id}`)}
                      />
                    </Tooltip>
                    {run.status === RunStatus.QUEUED ? (
                      <MenuItem
                        tagName="button"
                        icon="history_toggle_off"
                        text="View queue criteria"
                        intent="none"
                        onClick={() => setVisibleDialog('queue-criteria')}
                      />
                    ) : null}
                    {runMetricsEnabled && RunMetricsDialog ? (
                      <MenuItem
                        tagName="button"
                        icon="asset_plot"
                        text="View container metrics"
                        intent="none"
                        onClick={() => setVisibleDialog('metrics')}
                      />
                    ) : null}
                    {run.hasConcurrencyKeySlots && doneStatuses.has(run.status) ? (
                      <MenuItem
                        text="Free concurrency slots"
                        icon="lock"
                        onClick={freeConcurrencySlots}
                      />
                    ) : null}
                  </>
                ) : null}
                {run.hasDeletePermission ? (
                  <MenuItem
                    icon="delete"
                    text="Delete"
                    intent="danger"
                    onClick={() => setVisibleDialog('delete')}
                  />
                ) : null}
              </Menu>
            }
          >
            <Button icon={<Icon name="expand_more" />} />
          </Popover>
        ) : null}
      </Group>
      <RunConfigDialog
        isOpen={visibleDialog === 'config'}
        onClose={() => setVisibleDialog(null)}
        mode={run.mode}
        runConfigYaml={run.runConfigYaml}
        tags={run.tags}
        isJob={isJob}
      />
      {run.status === RunStatus.QUEUED ? (
        <QueuedRunCriteriaDialog
          run={run}
          isOpen={visibleDialog === 'queue-criteria'}
          onClose={() => setVisibleDialog(null)}
        />
      ) : null}
      {runMetricsEnabled && RunMetricsDialog ? (
        <RunMetricsDialog
          runId={run.id}
          isOpen={visibleDialog === 'metrics'}
          onClose={() => setVisibleDialog(null)}
        />
      ) : null}
      {run.hasDeletePermission ? (
        <DeletionDialog
          isOpen={visibleDialog === 'delete'}
          onClose={() => setVisibleDialog(null)}
          onComplete={() => {
            if (run.repositoryOrigin) {
              history.push(
                workspacePipelinePath({
                  repoName: run.repositoryOrigin.repositoryName,
                  repoLocation: run.repositoryOrigin.repositoryLocationName,
                  pipelineName: run.pipelineName,
                  isJob,
                  path: '/runs',
                }),
              );
            } else {
              setVisibleDialog(null);
            }
          }}
          onTerminateInstead={() => setVisibleDialog('terminate')}
          selectedRuns={{[run.id]: run.canTerminate}}
        />
      ) : null}
      {run.hasTerminatePermission ? (
        <TerminationDialog
          isOpen={visibleDialog === 'terminate'}
          onClose={() => setVisibleDialog(null)}
          onComplete={() => {
            refetch();
          }}
          selectedRuns={{[run.id]: run.canTerminate}}
        />
      ) : null}
      {run.allPools && run.allPools.length ? (
        <RunPoolsDialog
          isOpen={visibleDialog === 'pools'}
          pools={run.allPools}
          onClose={() => setVisibleDialog(null)}
        />
      ) : null}
    </div>
  );
};
