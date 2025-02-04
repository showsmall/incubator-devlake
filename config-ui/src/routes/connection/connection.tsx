/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import { useState, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { DeleteOutlined, PlusOutlined, NodeIndexOutlined, LinkOutlined, ClearOutlined } from '@ant-design/icons';
import { theme, Table, Button, Modal, message } from 'antd';

import API from '@/api';
import { useAppDispatch, useAppSelector } from '@/app/hook';
import { PageHeader, Message } from '@/components';
import { selectConnection, removeConnection } from '@/features';
import { useTips, useRefreshData } from '@/hooks';
import {
  ConnectionStatus,
  DataScopeRemote,
  getPluginConfig,
  getPluginScopeId,
  ScopeConfigForm,
  ScopeConfigSelect,
} from '@/plugins';
import { IConnection } from '@/types';
import { operator } from '@/utils';

import * as S from './styled';

export const Connection = () => {
  const [type, setType] = useState<
    | 'deleteConnection'
    | 'createDataScope'
    | 'clearDataScope'
    | 'deleteDataScope'
    | 'associateScopeConfig'
    | 'deleteConnectionFailed'
    | 'deleteDataScopeFailed'
  >();
  const [operating, setOperating] = useState(false);
  const [version, setVersion] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [scopeId, setScopeId] = useState<ID>();
  const [scopeIds, setScopeIds] = useState<ID[]>([]);
  const [scopeConfigId, setScopeConfigId] = useState<ID>();
  const [conflict, setConflict] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');

  const { plugin, id } = useParams() as { plugin: string; id: string };
  const connectionId = +id;

  const {
    token: { colorPrimary },
  } = theme.useToken();

  const dispatch = useAppDispatch();
  const connection = useAppSelector((state) => selectConnection(state, `${plugin}-${connectionId}`)) as IConnection;

  const navigate = useNavigate();
  const { setTips } = useTips();
  const { ready, data } = useRefreshData(
    () => API.scope.list(plugin, connectionId, { page, pageSize, blueprints: true }),
    [version, page, pageSize],
  );

  const { name } = connection;

  const pluginConfig = useMemo(() => getPluginConfig(plugin), [plugin]);

  const [dataSource, total] = useMemo(
    () => [
      data?.scopes.map((it: any) => ({
        id: getPluginScopeId(plugin, it.scope),
        name: it.scope.fullName ?? it.scope.name,
        projects: it.blueprints?.map((bp: any) => bp.projectName) ?? [],
        configId: it.scopeConfig?.id,
        configName: it.scopeConfig?.name,
      })) ?? [],
      data?.count ?? 0,
    ],
    [data],
  );

  const handleHideDialog = () => {
    setType(undefined);
  };

  const handleShowDeleteDialog = () => {
    setType('deleteConnection');
  };

  const handleDelete = async () => {
    const [, res] = await operator(
      async () => {
        try {
          await dispatch(removeConnection({ plugin, connectionId })).unwrap();
          return { status: 'success' };
        } catch (err: any) {
          const { status, data, message } = err;
          return {
            status: status === 409 ? 'conflict' : 'error',
            conflict: data ? [...data.projects, ...data.blueprints] : [],
            message,
          };
        }
      },
      {
        setOperating,
        hideToast: true,
      },
    );

    if (res.status === 'success') {
      message.success('Delete Connection Successful.');
      navigate('/connections');
    } else if (res.status === 'conflict') {
      setType('deleteConnectionFailed');
      setConflict(res.conflict);
      setErrorMsg(res.message);
    } else {
      message.error('Operation failed.');
      handleHideDialog();
    }
  };

  const handleShowCreateDataScopeDialog = () => {
    setType('createDataScope');
  };

  const handleCreateDataScope = () => {
    setVersion((v) => v + 1);
    handleHideDialog();
  };

  const handleShowClearDataScopeDialog = (scopeId: ID) => {
    setType('clearDataScope');
    setScopeId(scopeId);
  };

  const handleShowDeleteDataScopeDialog = (scopeId: ID) => {
    setType('deleteDataScope');
    setScopeId(scopeId);
  };

  const handleDeleteDataScope = async (onlyData: boolean) => {
    if (!scopeId) return;

    const [, res] = await operator(
      async () => {
        try {
          await API.scope.remove(plugin, connectionId, scopeId, onlyData);
          return { status: 'success' };
        } catch (err: any) {
          const { status, data } = err.response;
          return {
            status: status === 409 ? 'conflict' : 'error',
            conflict: data.data ? [...data.data.projects, ...data.data.blueprints] : [],
            message: data.message,
          };
        }
      },
      {
        setOperating,
        hideToast: true,
      },
    );

    if (res.status === 'success') {
      setVersion((v) => v + 1);
      message.success(onlyData ? 'Clear historical data successful.' : 'Delete Data Scope successful.');
      handleHideDialog();
    } else if (res.status === 'conflict') {
      setType('deleteDataScopeFailed');
      setConflict(res.conflict);
      setErrorMsg(res.message);
    } else {
      message.error('Operation failed.');
      handleHideDialog();
    }
  };

  const handleShowScopeConfigSelectDialog = (scopeIds: ID[]) => {
    setType('associateScopeConfig');
    setScopeIds(scopeIds);
  };

  const handleAssociateScopeConfig = async (trId: ID) => {
    const [success] = await operator(
      () =>
        Promise.all(
          scopeIds.map(async (scopeId) => {
            const scope = await API.scope.get(plugin, connectionId, scopeId);
            return API.scope.update(plugin, connectionId, scopeId, {
              ...scope,
              scopeConfigId: trId !== 'None' ? +trId : null,
            });
          }),
        ),
      {
        setOperating,
        formatMessage: () => `Associate scope config successful.`,
      },
    );

    if (success) {
      setVersion((v) => v + 1);
      setTips(
        <Message
          content="Scope Config(s) have been updated. If you would like to re-transform or re-collect the data in the related
        project(s), please go to the Project page and do so."
        />,
      );
      handleHideDialog();
    }
  };

  return (
    <PageHeader
      breadcrumbs={[
        { name: 'Connections', path: '/connections' },
        { name, path: '' },
      ]}
      extra={
        <Button type="primary" danger icon={<DeleteOutlined />} onClick={handleShowDeleteDialog}>
          Delete Connection
        </Button>
      }
    >
      <div style={{ marginBottom: 36 }}>
        <span>Status:</span>
        <ConnectionStatus connection={connection} />
      </div>
      <div style={{ marginBottom: 36 }}>
        Please note: In order to view DORA metrics, you will need to add Scope Configs.
      </div>
      <div style={{ marginBottom: 36 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={handleShowCreateDataScopeDialog}>
          Add Data Scope
        </Button>
        {plugin !== 'tapd' && pluginConfig.scopeConfig && (
          <Button
            style={{ marginLeft: 8 }}
            type="primary"
            disabled={!scopeIds.length}
            icon={<NodeIndexOutlined />}
            onClick={() => handleShowScopeConfigSelectDialog(scopeIds)}
          >
            Associate Scope Config
          </Button>
        )}
      </div>
      <Table
        rowKey="id"
        size="middle"
        loading={!ready}
        columns={[
          {
            title: 'Data Scope',
            dataIndex: 'name',
            key: 'name',
          },
          {
            title: 'Project',
            dataIndex: 'projects',
            key: 'projects',
            render: (projects) => (
              <>
                {projects.length ? (
                  <ul>
                    {projects.map((it: string) => (
                      <li key={it}>
                        <Link to={`/projects/${it}`}>{it}</Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  '-'
                )}
              </>
            ),
          },
          {
            title: 'Scope Config',
            key: 'scopeConfig',
            width: 400,
            render: (_, { id, configId, configName }) => (
              <>
                <span>{configId ? configName : 'N/A'}</span>
                {pluginConfig.scopeConfig && (
                  <Button
                    type="primary"
                    icon={<LinkOutlined />}
                    onClick={() => {
                      handleShowScopeConfigSelectDialog([id]);
                      setScopeConfigId(configId);
                    }}
                  />
                )}
              </>
            ),
          },
          {
            title: '',
            dataIndex: 'id',
            key: 'id',
            width: 100,
            render: (id) => (
              <>
                <Button type="primary" icon={<ClearOutlined />} onClick={() => handleShowClearDataScopeDialog(id)} />
                <Button type="primary" icon={<DeleteOutlined />} onClick={() => handleShowDeleteDataScopeDialog(id)} />
              </>
            ),
          },
        ]}
        dataSource={dataSource}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: setPage,
        }}
        rowSelection={{
          selectedRowKeys: scopeIds,
          onChange: (selectedRowKeys) => setScopeIds(selectedRowKeys),
        }}
      />
      {type === 'deleteConnection' && (
        <Modal
          open
          width={820}
          centered
          title="Would you like to delete this Data Connection?"
          okText="Confirm"
          okButtonProps={{
            loading: operating,
          }}
          onCancel={handleHideDialog}
          onOk={handleDelete}
        >
          <Message
            content=" This operation cannot be undone. Deleting a Data Connection will delete all data that have been collected
              in this Connection."
          />
        </Modal>
      )}
      {type === 'createDataScope' && (
        <Modal
          open
          width={820}
          centered
          style={{ width: 820 }}
          footer={null}
          title={
            <S.ModalTitle>
              <span className="icon">{pluginConfig.icon({ color: colorPrimary })}</span>
              <span className="name">Add Data Scope: {name}</span>
            </S.ModalTitle>
          }
          onCancel={handleHideDialog}
        >
          <DataScopeRemote
            plugin={plugin}
            connectionId={connectionId}
            disabledScope={dataSource}
            onCancel={handleHideDialog}
            onSubmit={handleCreateDataScope}
          />
        </Modal>
      )}
      {type === 'clearDataScope' && (
        <Modal
          open
          width={820}
          centered
          title="Would you like to clear the historical data of the selected Data Scope?"
          okText="Confirm"
          okButtonProps={{
            loading: operating,
          }}
          onCancel={handleHideDialog}
          onOk={() => handleDeleteDataScope(true)}
        >
          <Message content="This operation cannot be undone." />
        </Modal>
      )}
      {type === 'deleteDataScope' && (
        <Modal
          open
          width={820}
          centered
          title="Would you like to delete the selected Data Scope?"
          okText="Confirm"
          okButtonProps={{
            loading: operating,
          }}
          onCancel={handleHideDialog}
          onOk={() => handleDeleteDataScope(false)}
        >
          <Message
            content="This operation cannot be undone. Deleting Data Scope will delete all data that have been collected in the
              past."
          />
        </Modal>
      )}
      {type === 'associateScopeConfig' && (
        <Modal
          open
          width={960}
          centered
          footer={null}
          title={
            <S.ModalTitle>
              <span className="icon">{pluginConfig.icon({ color: colorPrimary })}</span>
              <span>Associate Scope Config</span>
            </S.ModalTitle>
          }
          onCancel={handleHideDialog}
        >
          {plugin === 'tapd' ? (
            <ScopeConfigForm
              plugin={plugin}
              connectionId={connectionId}
              scopeId={scopeIds[0]}
              scopeConfigId={scopeConfigId}
              onCancel={handleHideDialog}
              onSubmit={handleAssociateScopeConfig}
            />
          ) : (
            <ScopeConfigSelect
              plugin={plugin}
              connectionId={connectionId}
              scopeConfigId={scopeConfigId}
              onCancel={handleHideDialog}
              onSubmit={handleAssociateScopeConfig}
            />
          )}
        </Modal>
      )}
      {type === 'deleteConnectionFailed' && (
        <Modal
          open
          width={820}
          centered
          style={{ width: 820 }}
          title="This Data Connection can not be deleted."
          cancelButtonProps={{
            style: {
              display: 'none',
            },
          }}
          onCancel={handleHideDialog}
          onOk={handleHideDialog}
        >
          {!conflict.length ? (
            <Message content={errorMsg} />
          ) : (
            <>
              <Message
                content={`This Data Connection can not be deleted because it has been used in the following projects/blueprints:`}
              />
              <ul style={{ paddingLeft: 36 }}>
                {conflict.map((it) => (
                  <li key={it} style={{ color: colorPrimary }}>
                    {it}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
      {type === 'deleteDataScopeFailed' && (
        <Modal
          open
          width={820}
          centered
          title="This Data Scope can not be deleted."
          cancelButtonProps={{
            style: {
              display: 'none',
            },
          }}
          onCancel={handleHideDialog}
          onOk={handleHideDialog}
        >
          {!conflict.length ? (
            <Message content={errorMsg} />
          ) : (
            <>
              <Message content="This Data Scope can not be deleted because it has been used in the following projects/blueprints:" />
              <ul style={{ paddingLeft: 36 }}>
                {conflict.map((it) => (
                  <li key={it} style={{ color: colorPrimary }}>
                    {it}
                  </li>
                ))}
              </ul>
            </>
          )}
        </Modal>
      )}
    </PageHeader>
  );
};
