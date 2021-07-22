import { Component, Input, OnInit, Output, EventEmitter} from '@angular/core';

@Component({
    selector: 'app-student-info',
    templateUrl: './student-info.component.html',
    styleUrls: ['./student-info.component.scss']
})
export class StudentInfoComponent implements OnInit {

  constructor() { }

  studentPortalLinks: any [] = [
    {
      title: "My Connect",
      isLinkOpen: true,
      links: [
        {
          title: "Home", link: "/"
        },
        {
          title: "Calender (0)", link: "/dd"
        },
        {
          title: "Document Tracking", link: "#"
        }
      ]
    },
    {
      title: "Administrative Services",
      isLinkOpen: true,
      links: [
        {
          title: "My Timetable", link: "/student_schedule"
        },
        {
          title: "My Results", link: "#"
        },
        {
          title: "My Finacial Account", link: "#"
        }
      ] 
    },
    {
      title: "Curriculum Management",
      isLinkOpen: true,
      links: [
        {
          title: "My Modules", link: "#"
        }
      ] 
    },
    {
      title: "Announcements",
      isLinkOpen: true,
      links: [
        {
          title: "My Announcements (10)", link: "#"
        }
      ]
    },
    {
      title: "Student Support",
      isLinkOpen: true,
      links: [
        {
          title: "My Support Items (104)", link: "#"
        }
      ] 
    }
  ];

  onToggleEvent(button: string){
    switch (button) {
      case 'My Connect':
        this.studentPortalLinks[0].isLinkOpen = !this.studentPortalLinks[0].isLinkOpen;
        break;
      case 'Administrative Services':
        this.studentPortalLinks[1].isLinkOpen = !this.studentPortalLinks[1].isLinkOpen;
        break;
      case 'Curriculum Management':
        this.studentPortalLinks[2].isLinkOpen = !this.studentPortalLinks[2].isLinkOpen;
        break;
      case 'Announcements':
        this.studentPortalLinks[3].isLinkOpen = !this.studentPortalLinks[3].isLinkOpen;
        break;
      default:
        this.studentPortalLinks[4].isLinkOpen = !this.studentPortalLinks[4].isLinkOpen;
        break;
    }
  }

  ngOnInit(): void {
  }
}

@Component({
  selector: 'app-link-item',
  template: `
    <li class="list-none px-4 py-2 cursor-pointer bg-gray-100 text-sm">
      <a class="text-red-600" routerLink="{{linkPlaceholder}}">{{ titlePlaceholder }}</a>
    </li>`
})
export class LinkItemComponent {

  @Input ('title-placeholder') titlePlaceholder: any;
  @Input ('link-placeholder') linkPlaceholder: any;
}

// Items links that go under headings
@Component({
  selector: 'app-link-heading',
  template: `
    <div class="border-t-4 shadow-lg border-red-600 bg-gray-500 py-2 px-4 flex justify-between items-center">
      <p class="flex items-center text-sm font-medium text-white">{{titlePlaceholder}}</p>
      <button (click)="toggleHeadingEvent()" class="text-3xl text-white">{{buttonSymbolOpen}}</button>
    </div>
    `
})
export class LinkHeadingComponent {
  @Input ('title-placeholder') titlePlaceholder: any;
  @Input ('button-symbol-open') buttonSymbolOpen: string = '-';
  @Output ('toggle-heading') toggleHeading = new EventEmitter();

  toggleHeadingEvent(){
    this.toggleHeading.emit();
  }
}

// this will wrappe all the li elements
@Component({
  selector: 'app-link-wrapper',
  template: `
    <ul class="grid grid-cols-1 divide-y divide-gray-300">
      <ng-content></ng-content>
    </ul>
    `
})
export class LinkContainerComponent {

}