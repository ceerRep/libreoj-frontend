import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  Dropdown,
  Grid,
  Icon,
  Label,
  Header,
  Statistic,
  Menu,
  Divider,
  Segment,
  Popup,
  Button,
  Form,
  Message,
  Loader,
  Tab,
  Checkbox
} from "semantic-ui-react";
import { observer } from "mobx-react";
import update from "immutability-helper";
import objectPath from "object-path";
import { v4 as uuid } from "uuid";

import style from "./ProblemViewPage.module.less";

import api from "@/api";
import { Locale } from "@/interfaces/Locale";
import localeMeta from "@/locales/meta";
import { appState } from "@/appState";
import {
  useLocalizer,
  useLoginOrRegisterNavigation,
  useDialog,
  useAsyncCallbackPending,
  useRecaptcha,
  useScreenWidthWithin,
  useNavigationChecked,
  Link,
  useConfirmNavigation
} from "@/utils/hooks";
import toast from "@/utils/toast";
import copyToClipboard from "@/utils/copyToClipboard";
import { isValidDisplayId } from "@/utils/validators";
import PermissionManager from "@/components/LazyPermissionManager";
import { sortTags } from "../problemTag";
import { defineRoute, RouteError } from "@/AppRouter";
import { StatusIcon } from "@/components/StatusText";
import { ProblemType } from "@/interfaces/ProblemType";
import { ProblemTypeView } from "./common/interface";
import MarkdownContent, { MarkdownContentPatcher } from "@/markdown/MarkdownContent";
import { callApiWithFileUpload } from "@/utils/callApiWithFileUpload";
import { getProblemDisplayName, getProblemUrl, getExtractInterfaceCode } from "../utils";
import { CodeLanguage } from "@/interfaces/CodeLanguage";
import { onEnterPress } from "@/utils/onEnterPress";
import { downloadProblemFile, downloadProblemFilesAsArchive } from "../files/ProblemFilesPage";
import { makeToBeLocalizedText } from "@/locales";
import { EmojiRenderer } from "@/components/EmojiRenderer";
import { ProblemSubmissionsTab } from "./ProblemSubmissionsTab";

export function useProblemViewMarkdownContentPatcher(problemId: number): MarkdownContentPatcher {
  const _ = useLocalizer();

  const FILE_DOWNLOAD_LINK_PREFIX = "file:";
  const FILE_DOWNLOAD_LINK_ALL_PREFIX = "allfiles:";

  const FILE_DOWNLOAD_LINK_PREFIXES = [FILE_DOWNLOAD_LINK_PREFIX, FILE_DOWNLOAD_LINK_ALL_PREFIX];

  function isStartedWithFileDownloadPrefix(url: string) {
    return FILE_DOWNLOAD_LINK_PREFIXES.some(s => url.startsWith(s));
  }

  function tryParseAndDownload(fileUrl: string) {
    if (fileUrl.startsWith(FILE_DOWNLOAD_LINK_ALL_PREFIX)) {
      downloadProblemFilesAsArchive(
        problemId,
        fileUrl.substr(FILE_DOWNLOAD_LINK_ALL_PREFIX.length),
        "AdditionalFile",
        [],
        _
      );
      return true;
    } else if (fileUrl.startsWith(FILE_DOWNLOAD_LINK_PREFIX)) {
      const filename = fileUrl.substr(FILE_DOWNLOAD_LINK_PREFIX.length).split("/").join("");

      downloadProblemFile(problemId, "AdditionalFile", filename, _);
      return true;
    }

    return false;
  }

  return {
    onPatchRenderer(renderer) {
      const originValidateLink = renderer.validateLink;
      renderer.validateLink = url => originValidateLink(url) || isStartedWithFileDownloadPrefix(url.toLowerCase());
    },
    onPatchResult(element) {
      const onLinkClick = (href: string) => (e: MouseEvent) => tryParseAndDownload(href) && e.preventDefault();

      for (const link of element.getElementsByTagName("a")) link.addEventListener("click", onLinkClick(link.href));
    },
    onXssFileterAttr(tagName, attrName, value, escapeAttrValue) {
      if (tagName === "a" && attrName === "href" && isStartedWithFileDownloadPrefix(value)) return true;
    }
  };
}

async function fetchData(idType: "id" | "displayId", id: number, locale: Locale) {
  const { requestError, response } = await api.problem.getProblem({
    [idType]: id,
    localizedContentsOfLocale: locale,
    tagsOfLocale: locale,
    samples: true,
    judgeInfo: true,
    judgeInfoToBePreprocessed: true,
    statistics: true,
    discussionCount: true,
    permissionOfCurrentUser: true,
    lastSubmissionAndLastAcceptedSubmission: true
  });

  if (requestError) throw new RouteError(requestError, { showRefresh: true, showBack: true });
  else if (response.error) throw new RouteError(makeToBeLocalizedText(`problem.error.${response.error}`));

  sortTags(response.tagsOfLocale);
  return response;
}

interface ProblemViewPageProps {
  idType: "id" | "displayId";
  requestedLocale: Locale;
  problem: ApiTypes.GetProblemResponseDto;
  ProblemTypeView: ProblemTypeView<any>;
}

let ProblemViewPage: React.FC<ProblemViewPageProps> = props => {
  const _ = useLocalizer("problem");
  const navigation = useNavigationChecked();

  const isMobile = useScreenWidthWithin(0, 768);

  useEffect(() => {
    document.body.classList.add("full-width-mode");
    return () => {
      document.body.classList.remove("full-width-mode");
    };
  }, []);

  const [idString, title, all] = getProblemDisplayName(
    props.problem.meta,
    props.problem.localizedContentsOfLocale.title,
    _,
    "tuple"
  );

  useEffect(() => {
    appState.enterNewPage(`${all} - ${_(".title")}`, "problem_set");
  }, [appState.locale, props.problem]);

  const recaptcha = useRecaptcha();

  // Begin toggle tags
  const [showTags, setShowTags] = useState(appState.showTagsInProblemSet);
  function toggleTags() {
    setShowTags(!showTags);
  }
  // End toggle tags

  // Begin copy sample
  const [lastCopiedSample, setLastCopiedSample] = useState<{ id: number; type: "input" | "output" }>({
    id: null,
    type: null
  });
  async function onCopySampleClick(id: number, type: "input" | "output", data: string) {
    if (await copyToClipboard(data)) {
      setLastCopiedSample({ id, type });
    } else {
      toast.error(_(".sample.failed_to_copy"));
    }
  }
  // End copy sample

  // Begin set display ID
  const [setDisplayIdInputValue, setSetDisplayIdInputValue] = useState((props.problem.meta.displayId || "").toString());
  const [setDisplayIdPending, onSetDisplayId] = useAsyncCallbackPending(async () => {
    if (!isValidDisplayId(setDisplayIdInputValue)) {
      toast.error(_(".error.INVALID_DISPLAY_ID"));
    } else {
      const { requestError, response } = await api.problem.setProblemDisplayId({
        problemId: props.problem.meta.id,
        displayId: Number(setDisplayIdInputValue)
      });

      if (requestError) toast.error(requestError(_));
      else if (response.error) {
        toast.error(
          _(`.error.${response.error}`, {
            displayId: setDisplayIdInputValue
          })
        );
      } else {
        navigation.unconfirmed.navigate({
          pathname: !Number(setDisplayIdInputValue)
            ? getProblemUrl(props.problem.meta.id, { use: "id" })
            : getProblemUrl(Number(setDisplayIdInputValue), { use: "displayId" }),
          query: props.requestedLocale
            ? {
                locale: props.requestedLocale
              }
            : null
        });
      }
    }
  });
  // End set display ID

  // Begin set public
  const [setPublicPending, onSetPublic] = useAsyncCallbackPending(async (isPublic: boolean) => {
    const { requestError, response } = await api.problem.setProblemPublic({
      problemId: props.problem.meta.id,
      isPublic
    });

    if (requestError) toast.error(requestError(_));
    else if (response.error) {
      toast.error(_(`.error.${response.error}`));
    } else return navigation.unconfirmed.refresh();
  });
  // End set public

  // Begin "localized content unavailable" message
  const [localizedContentUnavailableMessageVisable, setLocalizedContentUnavailableMessageVisable] = useState(
    !appState.userPreference?.locale?.hideUnavailableMessage
  );
  // End "locaized content unavailable" message

  // Begin Permission Manager
  const refOpenPermissionManager = useRef<() => Promise<boolean>>();
  const [permissionManagerLoading, setPermissionManagerLoading] = useState(false);
  async function onGetInitialPermissions() {
    const { requestError, response } = await api.problem.getProblem({
      id: props.problem.meta.id,
      owner: true,
      permissions: true
    });
    if (requestError) toast.error(requestError(_));
    else if (response.error) toast.error(_(`.error.${response.error}`));
    else {
      return {
        owner: response.owner,
        userPermissions: response.permissions.userPermissions,
        groupPermissions: response.permissions.groupPermissions,
        haveSubmitPermission: props.problem.permissionOfCurrentUser.includes("ManagePermission")
      };
    }
    return null;
  }

  async function onSubmitPermissions(
    userPermissions: { userId: number; permissionLevel: number }[],
    groupPermissions: { groupId: number; permissionLevel: number }[]
  ) {
    const { requestError, response } = await api.problem.setProblemPermissions({
      problemId: props.problem.meta.id,
      userPermissions: userPermissions as any,
      groupPermissions: groupPermissions as any
    });
    if (requestError) toast.error(requestError(_));
    else if (response.error === "NO_SUCH_PROBLEM") toast.error(_(".error.NO_SUCH_PROBLEM"));
    else if (response.error) return response;
    return true;
  }

  async function onClickPermissionManage() {
    if (permissionManagerLoading) return;
    setPermissionManagerLoading(true);
    await refOpenPermissionManager.current();
    setPermissionManagerLoading(false);
  }

  const permissionManager = (
    <PermissionManager
      objectDescription={_(".action.permission_manager_description", { idString })}
      permissionsLevelDetails={{
        1: {
          title: _(".permission_level.read")
        },
        2: {
          title: _(".permission_level.write")
        }
      }}
      refOpen={refOpenPermissionManager}
      onGetInitialPermissions={onGetInitialPermissions}
      onSubmitPermissions={onSubmitPermissions}
    />
  );
  // End Permission Manager

  // Begin delete
  const [deletePending, onDelete] = useAsyncCallbackPending(async () => {
    const { requestError, response } = await api.problem.deleteProblem({
      problemId: props.problem.meta.id
    });
    if (requestError) toast.error(requestError(_));
    else if (response.error) toast.error(_(`.error.${response.error}`));
    else {
      toast.success(_(".action.delete_success"));
      navigation.unconfirmed.navigate("/p");
    }
  });
  const deleteDialog = useDialog(
    {
      basic: true
    },
    () => (
      <>
        <Header icon="delete" className={style.dialogHeader} content={_(".action.delete_confirm_title")} />
      </>
    ),
    () => _(".action.delete_confirm_content"),
    () => (
      <>
        <Button
          basic
          inverted
          negative
          content={_(".action.delete_confirm")}
          loading={deletePending}
          onClick={onDelete}
        />
        <Button
          basic
          inverted
          content={_(".action.delete_cancel")}
          disabled={deletePending}
          onClick={() => deleteDialog.close()}
        />
      </>
    )
  );
  // End delete

  const ProblemTypeView = props.ProblemTypeView;

  // Begin submit
  // const [inSubmitView, setInSubmitView] = useState(false); // Removed
  // const refScrollTopBackup = useRef(0); // Removed
  const getInitialSubmissionContent = () =>
    props.problem.lastSubmission.lastSubmissionContent || {
      ...ProblemTypeView.getDefaultSubmissionContent(),
      code: getExtractInterfaceCode(props.problem)
    };

  const initialSubmissionContent = useRef(getInitialSubmissionContent()).current;
  const [submissionContent, setSubmissionContent] = useState(initialSubmissionContent);

  function getDefaultCode(language: string) {
    if (language === CodeLanguage.Cuda) {
      return getExtractInterfaceCode(props.problem);
    }
    return "";
  }
  
  // Removed scroll element logic

  // Removed openSubmitView, closeSubmitView

  const [modified, setModified] = useConfirmNavigation();

  useEffect(() => {
    const currentContent = submissionContent as any;
    const isInitial = JSON.stringify(submissionContent) === JSON.stringify(initialSubmissionContent);
    const isDefault = currentContent.code === getDefaultCode(currentContent.language);
    const shouldBeModified = !(isInitial || isDefault);

    if (modified !== shouldBeModified) {
      setModified(shouldBeModified);
    }
  }, [submissionContent, initialSubmissionContent, modified]);

  function updateSubmissionContent(path: string, value: any) {
    const spec = {};
    objectPath.set(spec, path + ".$set", value);
    setSubmissionContent(prev => update(prev, spec));
  }


  const [submitPending, setSubmitPending] = useState(false);

  async function onSubmit(onGetSubmitFile?: () => Promise<Blob>) {
    if (submitPending) return;
    setSubmitPending(true);

    const { uploadError, requestError, response } = await callApiWithFileUpload(
      api.submission.submit,
      {
        problemId: props.problem.meta.id,
        content: submissionContent
      },
      () => recaptcha("SubmitProblem"),
      onGetSubmitFile ? await onGetSubmitFile() : null
    );

    if (uploadError) toast.error(_(".upload_error", { error: String(uploadError) }));
    else if (requestError) toast.error(requestError(_));
    else if (response.error) {
      toast.error(_(`.error.${response.error}`));
    } else {
      setModified(false);
      navigation.navigate(`/s/${response.submissionId}`);
    }

    setSubmitPending(false);
  }
  // End submit

  const navigateToLogin = useLoginOrRegisterNavigation("login");

  const statistic = (
    <Statistic.Group size="small" className={style.statistic}>
      <Statistic>
        <Statistic.Value>{props.problem.meta.acceptedSubmissionCount}</Statistic.Value>
        <Statistic.Label>{_(".statistic.accepted")}</Statistic.Label>
      </Statistic>
      <Statistic>
        <Statistic.Value>{props.problem.meta.submissionCount}</Statistic.Value>
        <Statistic.Label>{_(".statistic.submissions")}</Statistic.Label>
      </Statistic>
    </Statistic.Group>
  );

  const problemViewMarkdownContentPatcher = useProblemViewMarkdownContentPatcher(props.problem.meta.id);

  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [mobileEditorOpen, setMobileEditorOpen] = useState(false);

  const additionalActions = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
       {(props.problem.judgeInfo as any).runSamples && (
         <Checkbox
           className={style.skipSamples}
           label={_(".submit.skip_samples")}
           checked={(submissionContent as any).skipSamples}
           onChange={(e, { checked }) => updateSubmissionContent("skipSamples", checked)}
         />
       )}
       <Dropdown text="更多选项" button className="icon" direction="left">
         <Dropdown.Menu>
             {ProblemTypeView.enableStatistics() && (
               <Dropdown.Item
                 as={Link}
                 href={getProblemUrl(props.problem.meta, { subRoute: "statistics/fastest" })}
                 icon="sort content ascending"
                 text={_(".action.statistics")}
               />
             )}
             <Dropdown.Item
               as={Link}
               href={{
                 pathname: "/d",
                 query: {
                   problemId: props.problem.meta.id
                 }
               }}
               icon="comments"
               text={_(".action.discussion")}
             />
             <Dropdown.Item
               name={_(".action.files")}
               icon="folder open"
               as={Link}
               href={getProblemUrl(props.problem.meta, { subRoute: "files" })}
               text={_(".action.files")}
             />
             <Dropdown.Divider />
             {props.problem.permissionOfCurrentUser.includes("Modify") && (
               <Dropdown.Item
                 icon="edit"
                 as={Link}
                 href={{
                   pathname: getProblemUrl(props.problem.meta, { subRoute: "edit" }),
                   query: props.requestedLocale
                     ? {
                         locale: props.requestedLocale
                       }
                     : null
                 }}
                 text={_(".action.edit")}
               />
             )}
             {props.problem.permissionOfCurrentUser.includes("Modify") && (
               <Dropdown.Item
                 icon="cog"
                 as={Link}
                 href={getProblemUrl(props.problem.meta, { subRoute: "judge-settings" })}
                 text={_(".action.judge_settings")}
               />
             )}
             {props.problem.permissionOfCurrentUser.includes("Modify") && (
                 <Dropdown.Item onClick={onClickPermissionManage} icon="key" text={_(".action.permission_manage")} />
             )}
             {props.problem.permissionOfCurrentUser.includes("Delete") && (
               <Dropdown.Item
                 icon="delete"
                 onClick={deleteDialog.open}
                 text={_(".action.delete")}
               />
             )}
         </Dropdown.Menu>
       </Dropdown>
    </div>
  );

  const tabs = [
    {
      menuItem: _(".action.submit"),
      render: () => (
        <Tab.Pane attached={false} style={{ height: "100%", padding: 0, border: "none" }}>
          <ProblemTypeView.SubmitView
            judgeInfo={props.problem.judgeInfo}
            lastSubmission={props.problem.lastSubmission}
            inSubmitView={true}
            pendingSubmit={submitPending}
            submissionContent={submissionContent}
            onCloseSubmitView={() => {}}
            onUpdateSubmissionContent={updateSubmissionContent}
            onSubmit={onSubmit}
            layoutMode="sidebar"
            hideSkipSamples={true}
            additionalActions={additionalActions}
          />
        </Tab.Pane>
      )
    },
    {
      menuItem: _(".action.submission"),
      render: () => (
        <Tab.Pane attached={false} style={{ height: "100%", padding: 0, border: "none" }}>
          <ProblemSubmissionsTab problemId={props.problem.meta.id} />
        </Tab.Pane>
      )
    }
  ];

  const [leftWidthPercentage, setLeftWidthPercentage] = useState(50);
  const [isResizing, setIsResizing] = useState(false);
  const splitLayoutRef = useRef<HTMLDivElement>(null);

  const isLeftCollapsed = leftWidthPercentage < 2;
  const isRightCollapsed = leftWidthPercentage > 98;

  const restoreLeft = () => setLeftWidthPercentage(50);
  const restoreRight = () => setLeftWidthPercentage(50);

  const startResizing = useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizing(true);
    mouseDownEvent.preventDefault();

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
      if (splitLayoutRef.current) {
        const { left, width } = splitLayoutRef.current.getBoundingClientRect();
        const newLeftWidth = ((mouseMoveEvent.clientX - left) / width) * 100;
        
        // Allow full range resizing
        if (newLeftWidth >= 0 && newLeftWidth <= 100) {
            setLeftWidthPercentage(newLeftWidth);
        }
      }
    };

    const onMouseUp = () => {
      setIsResizing(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  if (isMobile) {
    if (mobileEditorOpen) {
         return (
             <div className={style.problemViewPage} style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', zIndex: 1000, background: '#fff' }}>
                  <div style={{ flex: '0 0 50px', display: 'flex', alignItems: 'center', padding: '0 10px', borderBottom: '1px solid #ddd', justifyContent: 'space-between', background: '#fff' }}>
                      <Button icon="arrow left" basic onClick={() => setMobileEditorOpen(false)} />
                      <Header as="h4" style={{ margin: 0 }}>{_(".action.submit")}</Header>
                      <Button 
                          primary 
                          size="small" 
                          icon="paper plane" 
                          content={_(".submit.submit")} 
                          onClick={() => onSubmit()} 
                          loading={submitPending}
                      />
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                      <ProblemTypeView.SubmitView
                          judgeInfo={props.problem.judgeInfo}
                          lastSubmission={props.problem.lastSubmission}
                          inSubmitView={true}
                          pendingSubmit={submitPending}
                          submissionContent={submissionContent}
                          onCloseSubmitView={() => setMobileEditorOpen(false)}
                          onUpdateSubmissionContent={updateSubmissionContent}
                          onSubmit={onSubmit}
                          layoutMode="sidebar"
                          hideSkipSamples={true}
                          additionalActions={additionalActions}
                      />
                  </div>
             </div>
         );
    }
    return (
      <div className={style.problemViewPage}>
        {permissionManager}
        {deleteDialog.element}
        <div className={style.topContainer}>
          <div className={style.titleSection}>
            <Header as="h1" className={style.header}>
              {props.problem.lastSubmission.lastAcceptedSubmission && (
                <Link
                  className={style.lastAcceptedSubmission}
                  href={`/s/${props.problem.lastSubmission.lastAcceptedSubmission.id}`}
                >
                  <StatusIcon status="Accepted" />
                </Link>
              )}
              <EmojiRenderer>
                <span>
                  {idString}.&nbsp;{title}
                </span>
              </EmojiRenderer>
              {props.problem.meta.locales.length > 1 && (
                <Dropdown icon="globe" className={style.languageSelectIcon}>
                  <Dropdown.Menu>
                    {props.problem.meta.locales.map((locale: Locale) => (
                      <Dropdown.Item
                        key={locale}
                        onClick={() => {
                          navigation.navigate({
                            query: {
                              locale: locale
                            }
                          });
                        }}
                        flag={localeMeta[locale].flag}
                        text={_(`language.${locale}`)}
                        value={locale}
                        selected={locale === props.problem.localizedContentsOfLocale.locale}
                      />
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              )}
            </Header>
            <div className={style.labels}>
              {!props.problem.meta.isPublic && (
                <Label size="small" color="red" basic>
                  <Icon name="eye slash" />
                  {_(`.meta_labels.non_public`)}
                </Label>
              )}
              {!props.problem.meta.displayId && (
                <Label size="small" color="brown" basic>
                  <Icon name="hashtag" />
                  {_(`.meta_labels.no_display_id`)}
                </Label>
              )}
              <Label size="small" color="teal">
                <Icon name="book" />
                {_(`.type.${props.problem.meta.type}`)}
              </Label>
              <ProblemTypeView.Labels size="small" judgeInfo={props.problem.judgeInfo} />
              {props.problem.tagsOfLocale.length > 0 && (
                <>
                  <Label
                    size="small"
                    color="grey"
                    as="a"
                    onClick={toggleTags}
                    className={style.toggleTagsLabel}
                  >
                    {!showTags ? _(".show_tags") : _(".hide_tags")}
                    <Icon name={"caret down"} style={{ transform: showTags && "rotateZ(-90deg)" }} />
                  </Label>
                  {showTags && (
                    <>
                      {props.problem.tagsOfLocale.map(tag => (
                        <EmojiRenderer key={tag.id}>
                          <Label
                            size="small"
                            content={tag.name}
                            color={tag.color as any}
                            as={Link}
                            href={{
                              pathname: "/p",
                              query: {
                                tagIds: tag.id.toString()
                              }
                            }}
                          />
                        </EmojiRenderer>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {statistic}
        </div>
        <Divider className={style.divider} />

        <div className={style.statementView} style={{ display: "block" }}>
          <div className={style.leftContainer}>
            {localizedContentUnavailableMessageVisable &&
              ![appState.contentLocale, props.requestedLocale].includes(
                props.problem.localizedContentsOfLocale.locale as Locale
              ) && (
                <Message
                  onDismiss={() => setLocalizedContentUnavailableMessageVisable(false)}
                  content={
                    <span
                      dangerouslySetInnerHTML={{
                        __html: _("common.localized_content_unavailable", {
                          display_locale: `<b>${_(`language.${props.problem.localizedContentsOfLocale.locale}`)}</b>`
                        })
                      }}
                    />
                  }
                />
              )}
            {props.problem.localizedContentsOfLocale.contentSections.map((section, i) => (
              <React.Fragment key={i}>
                <EmojiRenderer>
                  <Header size="large">{section.sectionTitle}</Header>
                </EmojiRenderer>
                {section.type === "Text" ? (
                  <>
                    <MarkdownContent content={section.text} patcher={problemViewMarkdownContentPatcher} />
                  </>
                ) : (
                  <>
                    <Grid columns="equal">
                      <Grid.Row>
                        <Grid.Column className={style.sample + " " + style.sampleInput}>
                          <Header size="small" className={style.sampleHeader}>
                            {_(".sample.input")}
                            <Label
                              size="small"
                              as="a"
                              pointing="below"
                              className={style.copySample}
                              onClick={e =>
                                onCopySampleClick(
                                  section.sampleId,
                                  "input",
                                  props.problem.samples[section.sampleId].inputData
                                )
                              }
                            >
                              {lastCopiedSample.id === section.sampleId && lastCopiedSample.type === "input"
                                ? _(".sample.copied")
                                : _(".sample.copy")}
                            </Label>
                          </Header>
                          <Segment className={style.sampleDataSegment}>
                            <EmojiRenderer>
                              <pre className={style.sampleDataPre}>
                                <code>{props.problem.samples[section.sampleId].inputData}</code>
                              </pre>
                            </EmojiRenderer>
                          </Segment>
                        </Grid.Column>
                        <Grid.Column
                          className={
                            style.sample +
                            " " +
                            style.sampleOutput +
                            (props.problem.samples[section.sampleId].outputData === "" ? " " + style.empty : "")
                          }
                        >
                          <Header size="small" className={style.sampleHeader}>
                            {_(".sample.output")}
                            <Label
                              size="small"
                              as="a"
                              pointing="below"
                              className={style.copySample}
                              onClick={e =>
                                onCopySampleClick(
                                  section.sampleId,
                                  "output",
                                  props.problem.samples[section.sampleId].outputData
                                )
                              }
                            >
                              {lastCopiedSample.id === section.sampleId && lastCopiedSample.type === "output"
                                ? _(".sample.copied")
                                : _(".sample.copy")}
                            </Label>
                          </Header>
                          <Segment className={style.sampleDataSegment}>
                            <EmojiRenderer>
                              <pre className={style.sampleDataPre}>
                                <code>{props.problem.samples[section.sampleId].outputData}</code>
                              </pre>
                            </EmojiRenderer>
                          </Segment>
                        </Grid.Column>
                      </Grid.Row>
                      <Grid.Row className={style.sampleExplanation}>
                        <Grid.Column>
                          <MarkdownContent content={section.text} patcher={problemViewMarkdownContentPatcher} />
                        </Grid.Column>
                      </Grid.Row>
                    </Grid>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
          <Divider className={style.divider + " " + style.dividerBottom} />
          {statistic}
        </div>
        
        {/* Mobile Action Button */}
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 100 }}>
             <Button
                circular
                icon="paper plane"
                size="huge"
                primary
                onClick={() => setMobileEditorOpen(true)}
             />
        </div>
      </div>
    );
  }

  return (
    <div className={style.splitLayout} ref={splitLayoutRef}>
      {permissionManager}
      {deleteDialog.element}
      {isLeftCollapsed ? (
          <div className={style.collapsedBar} onClick={restoreLeft}>
              <div className={style.verticalText}>{_(".title")}</div>
          </div>
      ) : (
      <div className={style.leftColumn} style={{ flex: `0 0 ${isRightCollapsed ? 'calc(100% - 32px)' : leftWidthPercentage + '%'}` , maxWidth: `${isRightCollapsed ? 'calc(100% - 32px)' : leftWidthPercentage + '%'}` , display: isRightCollapsed ? 'block' : (isLeftCollapsed ? 'none' : 'block') }}>
        <div className={style.topContainer}>
          <div className={style.titleSection}>
            <Header as="h1" className={style.header}>
              {props.problem.lastSubmission.lastAcceptedSubmission && (
                <Link
                  className={style.lastAcceptedSubmission}
                  href={`/s/${props.problem.lastSubmission.lastAcceptedSubmission.id}`}
                >
                  <StatusIcon status="Accepted" />
                </Link>
              )}
              <EmojiRenderer>
                <span>
                  {idString}.&nbsp;{title}
                </span>
              </EmojiRenderer>
              {props.problem.meta.locales.length > 1 && (
                <Dropdown icon="globe" className={style.languageSelectIcon}>
                  <Dropdown.Menu>
                    {props.problem.meta.locales.map((locale: Locale) => (
                      <Dropdown.Item
                        key={locale}
                        onClick={() => {
                          navigation.navigate({
                            query: {
                              locale: locale
                            }
                          });
                        }}
                        flag={localeMeta[locale].flag}
                        text={_(`language.${locale}`)}
                        value={locale}
                        selected={locale === props.problem.localizedContentsOfLocale.locale}
                      />
                    ))}
                  </Dropdown.Menu>
                </Dropdown>
              )}
            </Header>
            <div className={style.labels}>
              {!props.problem.meta.isPublic && (
                <Label size={isMobile ? "small" : null} color="red" basic>
                  <Icon name="eye slash" />
                  {_(`.meta_labels.non_public`)}
                </Label>
              )}
              {!props.problem.meta.displayId && (
                <Label size={isMobile ? "small" : null} color="brown" basic>
                  <Icon name="hashtag" />
                  {_(`.meta_labels.no_display_id`)}
                </Label>
              )}
              <Label size={isMobile ? "small" : null} color="teal">
                <Icon name="book" />
                {_(`.type.${props.problem.meta.type}`)}
              </Label>
              <ProblemTypeView.Labels size={isMobile ? "small" : null} judgeInfo={props.problem.judgeInfo} />
              {props.problem.tagsOfLocale.length > 0 && (
                <>
                  <Label
                    size={isMobile ? "small" : null}
                    color="grey"
                    as="a"
                    onClick={toggleTags}
                    className={style.toggleTagsLabel}
                  >
                    {!showTags ? _(".show_tags") : _(".hide_tags")}
                    <Icon name={"caret down"} style={{ transform: showTags && "rotateZ(-90deg)" }} />
                  </Label>
                  {showTags && (
                    <>
                      {props.problem.tagsOfLocale.map(tag => (
                        <EmojiRenderer key={tag.id}>
                          <Label
                            size={isMobile ? "small" : null}
                            content={tag.name}
                            color={tag.color as any}
                            as={Link}
                            href={{
                              pathname: "/p",
                              query: {
                                tagIds: tag.id.toString()
                              }
                            }}
                          />
                        </EmojiRenderer>
                      ))}
                    </>
                  )}
                </>
              )}
            </div>
          </div>
          {!isMobile && statistic}
        </div>
        <Divider className={style.divider} />

        <div className={style.statementView} style={{ display: "block" }}>
          <div className={style.leftContainer}>
            {localizedContentUnavailableMessageVisable &&
              ![appState.contentLocale, props.requestedLocale].includes(
                props.problem.localizedContentsOfLocale.locale as Locale
              ) && (
                <Message
                  onDismiss={() => setLocalizedContentUnavailableMessageVisable(false)}
                  content={
                    <span
                      dangerouslySetInnerHTML={{
                        __html: _("common.localized_content_unavailable", {
                          display_locale: `<b>${_(`language.${props.problem.localizedContentsOfLocale.locale}`)}</b>`
                        })
                      }}
                    />
                  }
                />
              )}
            {props.problem.localizedContentsOfLocale.contentSections.map((section, i) => (
              <React.Fragment key={i}>
                <EmojiRenderer>
                  <Header size="large">{section.sectionTitle}</Header>
                </EmojiRenderer>
                {section.type === "Text" ? (
                  <>
                    <MarkdownContent content={section.text} patcher={problemViewMarkdownContentPatcher} />
                  </>
                ) : (
                  <>
                    <Grid columns="equal">
                      <Grid.Row>
                        <Grid.Column className={style.sample + " " + style.sampleInput}>
                          <Header size="small" className={style.sampleHeader}>
                            {_(".sample.input")}
                            <Label
                              size="small"
                              as="a"
                              pointing="below"
                              className={style.copySample}
                              onClick={e =>
                                onCopySampleClick(
                                  section.sampleId,
                                  "input",
                                  props.problem.samples[section.sampleId].inputData
                                )
                              }
                            >
                              {lastCopiedSample.id === section.sampleId && lastCopiedSample.type === "input"
                                ? _(".sample.copied")
                                : _(".sample.copy")}
                            </Label>
                          </Header>
                          <Segment className={style.sampleDataSegment}>
                            <EmojiRenderer>
                              <pre className={style.sampleDataPre}>
                                <code>{props.problem.samples[section.sampleId].inputData}</code>
                              </pre>
                            </EmojiRenderer>
                          </Segment>
                        </Grid.Column>
                        <Grid.Column
                          className={
                            style.sample +
                            " " +
                            style.sampleOutput +
                            (props.problem.samples[section.sampleId].outputData === "" ? " " + style.empty : "")
                          }
                        >
                          <Header size="small" className={style.sampleHeader}>
                            {_(".sample.output")}
                            <Label
                              size="small"
                              as="a"
                              pointing="below"
                              className={style.copySample}
                              onClick={e =>
                                onCopySampleClick(
                                  section.sampleId,
                                  "output",
                                  props.problem.samples[section.sampleId].outputData
                                )
                              }
                            >
                              {lastCopiedSample.id === section.sampleId && lastCopiedSample.type === "output"
                                ? _(".sample.copied")
                                : _(".sample.copy")}
                            </Label>
                          </Header>
                          <Segment className={style.sampleDataSegment}>
                            <EmojiRenderer>
                              <pre className={style.sampleDataPre}>
                                <code>{props.problem.samples[section.sampleId].outputData}</code>
                              </pre>
                            </EmojiRenderer>
                          </Segment>
                        </Grid.Column>
                      </Grid.Row>
                      <Grid.Row className={style.sampleExplanation}>
                        <Grid.Column>
                          <MarkdownContent content={section.text} patcher={problemViewMarkdownContentPatcher} />
                        </Grid.Column>
                      </Grid.Row>
                    </Grid>
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
          {isMobile && (
            <>
              <Divider className={style.divider + " " + style.dividerBottom} />
              {statistic}
            </>
          )}
        </div>
      </div>
      )}

      {!isLeftCollapsed && !isRightCollapsed && (
      <div
          className={`${style.resizer} ${isResizing ? style.resizing : ""}`}
          onMouseDown={startResizing}
      />
      )}

      {isRightCollapsed ? (
          <div className={style.collapsedBar} onClick={restoreRight}>
              <div className={style.verticalText}>{_(".action.submit")}</div>
          </div>
      ) : (
      <div className={style.rightColumn} style={{ flex: isLeftCollapsed ? '1 1 auto' : `0 0 ${100 - leftWidthPercentage}%`, maxWidth: isLeftCollapsed ? 'calc(100% - 32px)' : `${100 - leftWidthPercentage}%`, position: "relative", display: isLeftCollapsed ? 'block' : (isRightCollapsed ? 'none' : 'block') }}>
        {activeTabIndex === 0 && (
          <div style={{ position: "absolute", top: 10, right: 0, zIndex: 10, display: "flex", alignItems: "center", height: "40px", gap: "10px", paddingRight: "5px" }}>
            <Button
              primary
              size="small"
              icon="paper plane"
              loading={submitPending}
              content={_(".submit.submit")}
              onClick={() => onSubmit()}
            />
          </div>
        )}
         <Tab 
            menu={{ secondary: true, pointing: true}} 
            panes={tabs} 
            className={style.rightTab}
            style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
            onTabChange={(e, data) => setActiveTabIndex(data.activeIndex as number)}
         />
      </div>
      )}
    </div>
  );
};

ProblemViewPage = observer(ProblemViewPage);

async function getProblemTypeView(type: ProblemType): Promise<ProblemTypeView<any>> {
  return (
    await (() => {
      switch (type) {
        case ProblemType.Traditional:
          return import("./types/TraditionalProblemView");
        case ProblemType.Interaction:
          return import("./types/InteractionProblemView");
        case ProblemType.SubmitAnswer:
          return import("./types/SubmitAnswerProblemView");
      }
    })()
  ).default;
}

export default {
  byId: defineRoute(async request => {
    const id = parseInt(request.params["id"]);
    const requestedLocale: Locale = request.query["locale"] in Locale && (request.query["locale"] as Locale);
    const problem = await fetchData("id", id, requestedLocale || appState.contentLocale);

    return (
      <ProblemViewPage
        key={uuid()}
        idType="id"
        requestedLocale={requestedLocale}
        problem={problem}
        ProblemTypeView={await getProblemTypeView(problem.meta.type as ProblemType)}
      />
    );
  }),
  byDisplayId: defineRoute(async request => {
    const displayId = parseInt(request.params["displayId"]);
    const requestedLocale: Locale = request.query["locale"] in Locale && (request.query["locale"] as Locale);
    const problem = await fetchData("displayId", displayId, requestedLocale || appState.contentLocale);

    return (
      <ProblemViewPage
        key={uuid()}
        idType="displayId"
        requestedLocale={requestedLocale}
        problem={problem}
        ProblemTypeView={await getProblemTypeView(problem.meta.type as ProblemType)}
      />
    );
  })
};