import Dialog from '../Dialog.jsx';
import TopicDetails from './TopicDetails.jsx';

// The topic's details in a popup, used on narrower screens; open while topic is set.
// detail_props are passed straight to TopicDetails.
function TopicDialog({ topic, on_close, ...detail_props }) {
  return (
    <Dialog title={topic?.topic ?? ''} is_open={Boolean(topic)} on_close={on_close}>
      {topic && <TopicDetails key={topic.id} topic={topic} section_heading="h3" {...detail_props} />}
    </Dialog>
  );
}

export default TopicDialog;
