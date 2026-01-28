import React, { PropsWithChildren, useState, useRef, useCallback } from "react";
import { Header, Menu, Button, Checkbox, Icon } from "semantic-ui-react";
import { observer } from "mobx-react";

import style from "./SubmitViewFrame.module.less";

import { useLocalizer, Link } from "@/utils/hooks";
import StatusText from "@/components/StatusText";
import ScoreText from "@/components/ScoreText";

interface SubmitViewFrameProps {
  showSkipSamples: boolean;
  mainContent: React.ReactNode;
  sidebarContent: React.ReactNode;
  submitDisabled: boolean;
  onGetSubmitFile?: () => Promise<Blob>;

  inSubmitView: boolean;
  pendingSubmit: boolean;
  lastSubmission: ApiTypes.ProblemLastSubmissionDto;
  submissionContent: unknown;
  onCloseSubmitView: () => void;
  onUpdateSubmissionContent: (path: string, value: unknown) => void;
  onSubmit: (onGetSubmitFile?: () => Promise<Blob>) => void;
  layoutMode?: "default" | "sidebar";
  hideSkipSamples?: boolean;
  additionalActions?: React.ReactNode;
}

let SubmitViewFrame: React.FC<SubmitViewFrameProps> = props => {
  const _ = useLocalizer("problem");

  // Bottom panel resizing logic
  const [bottomPanelHeight, setBottomPanelHeight] = useState(120);
  const [isResizingBottom, setIsResizingBottom] = useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const startResizingBottom = useCallback((mouseDownEvent: React.MouseEvent) => {
    setIsResizingBottom(true);
    mouseDownEvent.preventDefault();

    const startY = mouseDownEvent.clientY;
    const startHeight = bottomPanelHeight;

    const onMouseMove = (mouseMoveEvent: MouseEvent) => {
        const deltaY = startY - mouseMoveEvent.clientY;
        const newHeight = startHeight + deltaY;
        
        // 允许高度调整，但如果不折叠，最小高度设为 30px
        if (newHeight >= 30 && newHeight < 600) {
             setBottomPanelHeight(newHeight);
             setIsBottomCollapsed(false);
        } else if (newHeight < 30) {
             setBottomPanelHeight(30);
             setIsBottomCollapsed(true);
        }
    };

    const onMouseUp = () => {
      setIsResizingBottom(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, [bottomPanelHeight]);

  const toggleBottomCollapse = () => {
      if (isBottomCollapsed) {
          setBottomPanelHeight(120);
          setIsBottomCollapsed(false);
      } else {
          setBottomPanelHeight(30);
          setIsBottomCollapsed(true);
      }
  }

  if (props.layoutMode === "sidebar") {
    return (
      <div className={style.sidebarMode} ref={containerRef}>
        <div className={style.sidebarEditor} style={{ flexGrow: 1, height: `calc(100% - ${bottomPanelHeight}px)` }}>
          {props.mainContent}
        </div>
        
        <div 
            className={`${style.resizer} ${isResizingBottom ? style.resizing : ""}`}
            onMouseDown={startResizingBottom}
        />

        <div className={style.bottomPanel} style={{ height: bottomPanelHeight }}>
            <div className={style.bottomPanelHeader}>
                 <div className={style.tabTitle} onClick={toggleBottomCollapse}>
                    <Icon name={isBottomCollapsed ? "angle up" : "angle down"} />
                    选项
                 </div>
            </div>
            {!isBottomCollapsed && (
                <div className={style.bottomPanelContent}>
                    <div className={style.optionsContainer}>
                        <div className={style.languageSection}>
                            {props.sidebarContent}
                        </div>
                        {props.additionalActions && (
                            <div className={style.actionsSection}>
                                {props.additionalActions}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
      </div>
    );
  }

  return (
    <div className={style.submitView} style={{ display: props.inSubmitView ? null : "none" }}>
      <div className={style.leftContainer}>{props.mainContent}</div>
      <div className={style.rightContainer}>
        <Menu pointing secondary vertical className={style.actionMenu}>
          <Menu.Item name={_(".submit.back_to_statement")} icon="arrow left" onClick={props.onCloseSubmitView} />
          <div />
        </Menu>
        {props.sidebarContent}
        {props.showSkipSamples && (
          <Checkbox
            className={style.skipSamples}
            label={_(".submit.skip_samples")}
            checked={(props.submissionContent as any).skipSamples}
            onChange={(e, { checked }) => props.onUpdateSubmissionContent("skipSamples", checked)}
          />
        )}
        <Button
          className={style.submitButton}
          primary
          fluid
          icon="paper plane"
          loading={props.pendingSubmit}
          disabled={props.submitDisabled}
          content={_(".submit.submit")}
          onClick={() => props.onSubmit(props.onGetSubmitFile)}
        />
        {props.lastSubmission && props.lastSubmission.lastSubmission && (
          <div className={style.lastSubmission}>
            <Header size="tiny" content={_(".submit.last_submission")} />
            <Link href={`/s/${props.lastSubmission.lastSubmission.id}`}>
              <StatusText status={props.lastSubmission.lastSubmission.status} />
            </Link>
            <Link className={style.scoreText} href={`/s/${props.lastSubmission.lastSubmission.id}`}>
              <ScoreText score={props.lastSubmission.lastSubmission.score || 0} />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

SubmitViewFrame = observer(SubmitViewFrame);

interface EditorWrapperProps {
  disabled?: boolean;
}

const EditorWrapper: React.FC<PropsWithChildren<EditorWrapperProps>> = props => {
  return <div className={style.editorWrapper + (props.disabled ? " " + style.disabled : "")}>{props.children}</div>;
};

export default Object.assign(SubmitViewFrame, {
  EditorWrapper
});
